"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { applyAction, decideBot, type HandState, type PokerAction } from "./poker-engine";
import type { EngineResponse } from "./poker.worker";

const WORKER_TIMEOUT_MS = 15000;
// After this many consecutive worker failures, stay in main-thread compatibility mode.
const MAX_WORKER_FAILURES = 2;

export function usePokerEngine(onState: (state: HandState) => void) {
  const worker = useRef<Worker | null>(null);
  const failures = useRef(0);
  const generation = useRef(0);
  const pending = useRef(false);
  const commit = useRef(onState);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { commit.current = onState; }, [onState]);

  const settle = useCallback(() => {
    pending.current = false;
    setBusy(false);
    if (timeout.current) clearTimeout(timeout.current);
  }, []);

  const failWorker = useCallback((message: string) => {
    const interrupted = pending.current;
    worker.current?.terminate();
    worker.current = null;
    failures.current += 1;
    generation.current += 1;
    settle();
    // An idle worker that fails is simply replaced on the next request.
    if (!interrupted) return;
    const next = failures.current >= MAX_WORKER_FAILURES ? "Retry to continue in compatibility mode." : "Retry to restart it.";
    setError(`${message} Your hand is unchanged. ${next}`);
  }, [settle]);

  // Creates the worker on demand, so a failed worker is replaced on the next request.
  const getWorker = useCallback((): Worker | null => {
    if (worker.current) return worker.current;
    if (failures.current >= MAX_WORKER_FAILURES || typeof Worker === "undefined") return null;
    try {
      const instance = new Worker(new URL("./poker.worker.ts", import.meta.url), { type: "module" });
      instance.onmessage = ({ data }: MessageEvent<EngineResponse>) => {
        if (data.id !== generation.current) return;
        settle();
        if (data.state) {
          failures.current = 0;
          commit.current(data.state);
        } else setError(data.error ?? "Decision failed. Please retry.");
      };
      instance.onerror = () => failWorker("The background engine stopped.");
      worker.current = instance;
      return instance;
    } catch {
      failures.current = MAX_WORKER_FAILURES;
      return null;
    }
  }, [failWorker, settle]);

  useEffect(() => {
    getWorker();
    return () => {
      worker.current?.terminate();
      worker.current = null;
      generation.current += 1;
      pending.current = false;
      if (timeout.current) clearTimeout(timeout.current);
    };
  }, [getWorker]);

  const cancel = useCallback(() => {
    generation.current += 1;
    settle();
    setError("");
  }, [settle]);

  const run = useCallback((state: HandState, action?: PokerAction) => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    const id = ++generation.current;
    const instance = getWorker();
    if (instance) {
      instance.postMessage({ id, state, action });
      timeout.current = setTimeout(() => {
        if (id === generation.current) failWorker("The engine timed out.");
      }, WORKER_TIMEOUT_MS);
    } else {
      // Allow the busy state to paint before the compatibility computation.
      timeout.current = setTimeout(() => {
        if (id !== generation.current) return;
        try { commit.current(applyAction(state, state.currentActor, action ?? decideBot(state, state.currentActor))); }
        catch { setError("Decision failed. Your hand is unchanged. Please retry."); }
        finally { pending.current = false; setBusy(false); }
      }, 30);
    }
  }, [getWorker, failWorker]);

  return { run, cancel, busy, error };
}
