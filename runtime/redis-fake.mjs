import net from "node:net";

const values = new Map();
const server = net.createServer((socket) => {
  let pending = Buffer.alloc(0);
  socket.on("data", (chunk) => {
    pending = Buffer.concat([pending, chunk]);
    while (true) {
      const parsed = takeCommand(pending);
      if (!parsed) {
        break;
      }
      pending = Buffer.from(parsed.rest);
      const [op, key, value] = parsed.args;
      if (op === "PING") {
        socket.write("+PONG\r\n");
        continue;
      }
      if (op === "SET" && key && parsed.args.includes("NX") && values.has(key)) {
        socket.write("$-1\r\n");
        continue;
      }
      if (op === "SET" && key) {
        values.set(key, value ?? "");
        socket.write("+OK\r\n");
        continue;
      }
      if (op === "GET" && key) {
        const stored = values.get(key);
        socket.write(stored === undefined ? "$-1\r\n" : `$${Buffer.byteLength(stored)}\r\n${stored}\r\n`);
      }
    }
  });
});

server.listen(0, "127.0.0.1", () => {
  const address = server.address();
  process.stdout.write(`${address.port}\n`);
});

function takeCommand(buffer) {
  if (buffer.length < 4 || String.fromCharCode(buffer[0]) !== "*") {
    return null;
  }
  const header = buffer.indexOf("\r\n");
  if (header < 0) {
    return null;
  }
  const count = Number(buffer.subarray(1, header).toString("utf8"));
  let offset = header + 2;
  const args = [];
  for (let index = 0; index < count; index += 1) {
    if (offset >= buffer.length || String.fromCharCode(buffer[offset]) !== "$") {
      return null;
    }
    const end = buffer.indexOf("\r\n", offset);
    if (end < 0) {
      return null;
    }
    const length = Number(buffer.subarray(offset + 1, end).toString("utf8"));
    const start = end + 2;
    if (buffer.length < start + length + 2) {
      return null;
    }
    args.push(buffer.subarray(start, start + length).toString("utf8"));
    offset = start + length + 2;
  }
  return { args, rest: buffer.subarray(offset) };
}
