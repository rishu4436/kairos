import net from "node:net";
import tls from "node:tls";
import { parentPort, workerData } from "node:worker_threads";

const header = new Int32Array(workerData.sab, 0, 4);
const body = new Uint8Array(workerData.sab, 16);
let socket = null;
let buffer = Buffer.alloc(0);
let pending = null;

function signal(status, text) {
  const encoded = Buffer.from(text ?? "", "utf8");
  if (encoded.length > body.length) {
    Atomics.store(header, 1, 2);
    Atomics.store(header, 2, 0);
  } else {
    body.set(encoded);
    Atomics.store(header, 1, status);
    Atomics.store(header, 2, encoded.length);
  }
  Atomics.add(header, 0, 1);
  Atomics.notify(header, 0);
}

function encode(args) {
  const chunks = [Buffer.from(`*${args.length}\r\n`)];
  for (const arg of args) {
    const value = Buffer.from(String(arg), "utf8");
    chunks.push(Buffer.from(`$${value.length}\r\n`));
    chunks.push(value);
    chunks.push(Buffer.from("\r\n"));
  }
  return Buffer.concat(chunks);
}

function tryDecode(source) {
  if (source.length < 1) {
    return null;
  }
  const prefix = String.fromCharCode(source[0]);
  const crlf = source.indexOf("\r\n");
  if (crlf < 0) {
    return null;
  }
  const line = source.subarray(1, crlf).toString("utf8");
  const restAt = crlf + 2;
  if (prefix === "+") {
    return { value: line, rest: source.subarray(restAt) };
  }
  if (prefix === "-") {
    return { error: true, rest: source.subarray(restAt) };
  }
  if (prefix === ":") {
    return { value: line, rest: source.subarray(restAt) };
  }
  if (prefix === "$") {
    const length = Number(line);
    if (length < 0) {
      return { value: null, rest: source.subarray(restAt) };
    }
    if (source.length < restAt + length + 2) {
      return null;
    }
    return { value: source.subarray(restAt, restAt + length).toString("utf8"), rest: source.subarray(restAt + length + 2) };
  }
  return { error: true, rest: source.subarray(restAt) };
}

function onData(chunk) {
  buffer = Buffer.concat([buffer, chunk]);
  while (pending) {
    const decoded = tryDecode(buffer);
    if (!decoded) {
      return;
    }
    buffer = Buffer.from(decoded.rest);
    const current = pending;
    pending = null;
    if (decoded.error) {
      current.reject(new Error("STATE_BACKEND_ERROR"));
    } else {
      current.resolve(decoded.value);
    }
  }
}

function send(args) {
  return new Promise((resolve, reject) => {
    pending = { resolve, reject };
    socket.write(encode(args));
  });
}

async function connect() {
  const url = new URL(workerData.url);
  const secure = url.protocol === "rediss:";
  const port = Number(url.port || (secure ? 6380 : 6379));
  socket = secure
    ? tls.connect({ host: url.hostname, port, servername: url.hostname })
    : net.connect({ host: url.hostname, port });
  await new Promise((resolve, reject) => {
    socket.once(secure ? "secureConnect" : "connect", resolve);
    socket.once("error", reject);
  });
  socket.on("data", onData);
  socket.on("error", () => {
    if (pending) {
      const current = pending;
      pending = null;
      current.reject(new Error("STATE_BACKEND_ERROR"));
    }
  });
  if (url.password) {
    const user = decodeURIComponent(url.username || "default");
    await send(["AUTH", user, decodeURIComponent(url.password)]);
  }
  const db = url.pathname.replace(/^\//, "");
  if (db && db !== "0") {
    await send(["SELECT", db]);
  }
  signal(1, "READY");
}

parentPort.on("message", async (args) => {
  try {
    const value = await send(args);
    if (value === null) {
      signal(3, "");
      return;
    }
    signal(1, String(value));
  } catch {
    signal(2, "STATE_BACKEND_ERROR");
  }
});

connect().catch(() => {
  signal(2, "STATE_BACKEND_ERROR");
});
