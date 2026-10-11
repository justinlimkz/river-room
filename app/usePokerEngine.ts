"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { applyAction, decideBot, type HandState, type PokerAction } from "./poker-engine";
import type { EngineResponse } from "./poker.worker";

export function usePokerEngine(onState: (state: HandState) => void) {
  const worker = useRef<Worker | null>(null);
  const generation = useRef(0);
  const pending = useRef(false);
  const commit = useRef(onState);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { commit.current = onState; }, [onState]);
  useEffect(() => {
    let instance: Worker | null = null;
    try {
      instance = new Worker(new URL("./poker.worker.ts", import.meta.url), { type: "module" });
      worker.current = instance;
      instance.onmessage = ({ data }: MessageEvent<EngineResponse>) => {
        if (data.id !== generation.current) return;
        pending.current = false;
        setBusy(false);
        if (timeout.current) clearTimeout(timeout.current);
        if (data.state) commit.current(data.state);
        else setError(data.error ?? "Decision failed. Please retry.");
      };
      instance.onerror = () => {
        instance?.terminate();
        worker.current = null;
        generation.current += 1;
        pending.current = false;
        setBusy(false);
        if (timeout.current) clearTimeout(timeout.current);
        setError("Background engine unavailable. Retry to continue in compatibility mode.");
      };
    } catch {
      worker.current = null;
    }
    return () => { instance?.terminate(); worker.current = null; generation.current += 1; pending.current = false; if (timeout.current) clearTimeout(timeout.current); };
  }, []);
  const cancel = useCallback(() => {
    generation.current += 1;
    pending.current = false;
    setBusy(false);
    setError("");
    if (timeout.current) clearTimeout(timeout.current);
  }, []);
  const run = useCallback((state: HandState, action?: PokerAction) => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    const id = ++generation.current;
    if (worker.current) {
      worker.current.postMessage({ id, state, action });
      timeout.current = setTimeout(() => {
        if (id !== generation.current) return;
        worker.current?.terminate();
        worker.current = null;
        generation.current += 1;
        pending.current = false;
        setBusy(false);
        setError("The engine timed out. Your hand is unchanged. Retry in compatibility mode.");
      }, 15000);
    } else {
      // Allow the busy state to paint before the compatibility computation.
      timeout.current = setTimeout(() => {
        if (id !== generation.current) return;
        try { commit.current(applyAction(state, state.currentActor, action ?? decideBot(state, state.currentActor))); }
        catch { setError("Decision failed. Your hand is unchanged. Please retry."); }
        finally { pending.current = false; setBusy(false); }
      }, 30);
    }
  }, []);
  return { run, cancel, busy, error };
}
