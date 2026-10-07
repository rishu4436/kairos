"use client";

import { useEffect, useState } from "react";
import type { ObservationBoard } from "@/domain/observation";

const POLL_USER = "user_demo";

export function useObservationBoard(initial: ObservationBoard | null = null): {
  board: ObservationBoard | null;
  now: number;
  phase: "loading" | "ready" | "error";
  fault: string | null;
} {
  const [board, setBoard] = useState<ObservationBoard | null>(initial);
  const [now, setNow] = useState(() => (initial ? Date.parse(initial.generatedAt) : Date.now()));
  const [phase, setPhase] = useState<"loading" | "ready" | "error">(
    initial == null ? "loading" : initial.ok ? "ready" : "error",
  );
  const [fault, setFault] = useState<string | null>(null);

  useEffect(() => {
    const clock = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(clock);
  }, []);

  useEffect(() => {
    let stopped = false;
    let timer = 0;
    let active: AbortController | null = null;
    let failureStreak = 0;

    async function run() {
      active?.abort();
      const controller = new AbortController();
      active = controller;
      try {
        const response = await fetch(`/api/observations?userId=${POLL_USER}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        const body = (await response.json()) as ObservationBoard;
        if (stopped) {
          return;
        }
        setBoard(body);
        setFault(null);
        setPhase(body.ok ? "ready" : "error");
        const transient =
          body.error?.category === "RATE_LIMITED" ||
          body.error?.category === "UPSTREAM_ERROR" ||
          body.error?.category === "TIMEOUT";
        failureStreak = body.ok ? 0 : failureStreak + 1;
        const base = body.refreshIntervalMs || 15_000;
        const backoff = transient ? Math.min(30_000, 2_000 * 2 ** Math.min(failureStreak, 4)) : base;
        timer = window.setTimeout(run, body.ok ? base : backoff);
      } catch (error) {
        if (stopped || (error instanceof DOMException && error.name === "AbortError")) {
          return;
        }
        failureStreak += 1;
        setPhase("error");
        setFault("The observation request did not complete.");
        timer = window.setTimeout(run, Math.min(30_000, 2_000 * 2 ** Math.min(failureStreak, 4)));
      }
    }

    void run();
    return () => {
      stopped = true;
      active?.abort();
      window.clearTimeout(timer);
    };
  }, []);

  return { board, now, phase, fault };
}
