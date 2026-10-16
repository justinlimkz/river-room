"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createSession, isValidSavedState, migrateSavedState, type HandState } from "./poker-engine";

const STORAGE_KEY = "riverroom-session-v9";
const LEGACY_STORAGE_KEYS = ["riverroom-session-v8", "riverroom-session-v7", "riverroom-session-v6", "riverroom-session-v5", "riverroom-session-v4"];
const BACKUP_KEY = "riverroom-session-unreadable";
const PREFERENCES_KEY = "riverroom-preferences-v1";
const SAVE_DELAY_MS = 250;

export type Preferences = { inBB: boolean; speed: "normal" | "fast" };
const DEFAULT_PREFERENCES: Preferences = { inBB: false, speed: "normal" };

function readPreferences(): Preferences {
  try {
    const saved = JSON.parse(localStorage.getItem(PREFERENCES_KEY) ?? "null");
    return {
      inBB: typeof saved?.inBB === "boolean" ? saved.inBB : DEFAULT_PREFERENCES.inBB,
      speed: saved?.speed === "fast" ? "fast" : "normal",
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

/** Restores the saved session. An unreadable save is backed up before anything can overwrite it. */
function restoreSession(): { state: HandState; warning: string; canSave: boolean } {
  let raw: string | null;
  try {
    raw = localStorage.getItem(STORAGE_KEY) ?? LEGACY_STORAGE_KEYS.map((key) => localStorage.getItem(key)).find(Boolean) ?? null;
  } catch {
    return { state: createSession(), warning: "Device storage is unavailable. Play can continue, but this session will not survive a reload.", canSave: false };
  }
  if (!raw) return { state: createSession(), warning: "", canSave: true };
  try {
    const parsed: unknown = JSON.parse(raw);
    const restored = isValidSavedState(parsed) ? parsed : migrateSavedState(parsed);
    if (restored) return { state: restored, warning: "", canSave: true };
  } catch { /* Unparseable; handled with the unrecognized case below. */ }
  try {
    localStorage.setItem(BACKUP_KEY, raw);
    return { state: createSession(), warning: "Your saved session could not be restored. A new table is open; the unreadable save was kept as a backup on this device.", canSave: true };
  } catch {
    // Without a backup, saving would destroy the only copy. Wait for an explicit reset.
    return { state: createSession(), warning: "Your saved session could not be restored. A new table is open; the original save has not been touched and this session will not be saved until you reset.", canSave: false };
  }
}

export function useSavedSession() {
  const [state, setState] = useState<HandState | null>(null);
  const [preferences, setPreferences] = useState<Preferences>(DEFAULT_PREFERENCES);
  const [storageWarning, setStorageWarning] = useState("");
  const canSave = useRef(false);
  const preferencesLoaded = useRef(false);
  const latest = useRef<HandState | null>(null);

  useEffect(() => {
    const restored = restoreSession();
    const savedPreferences = readPreferences();
    canSave.current = restored.canSave;
    // Deferred so the first client render matches the server-rendered loading screen.
    queueMicrotask(() => {
      preferencesLoaded.current = true;
      setPreferences(savedPreferences);
      setStorageWarning(restored.warning);
      setState(restored.state);
    });
  }, []);

  const save = useCallback(() => {
    if (!latest.current || !canSave.current) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(latest.current)); }
    catch { setStorageWarning("Device storage is unavailable or full. Play can continue, but this session may not survive a reload."); }
  }, []);

  useEffect(() => {
    latest.current = state;
    if (!state) return;
    const timer = window.setTimeout(save, SAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [state, save]);

  useEffect(() => {
    window.addEventListener("pagehide", save);
    return () => { window.removeEventListener("pagehide", save); save(); };
  }, [save]);

  useEffect(() => {
    if (!preferencesLoaded.current) return;
    try { localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences)); }
    catch { /* Preferences are optional; session storage failures are reported separately. */ }
  }, [preferences]);

  const updatePreferences = useCallback((change: Partial<Preferences>) => setPreferences((current) => ({ ...current, ...change })), []);

  /** Starts a fresh session. An explicit reset may overwrite a save that could not be backed up. */
  const resetSession = useCallback(() => {
    canSave.current = true;
    setStorageWarning("");
    setState(createSession());
  }, []);

  return { state, setState, preferences, updatePreferences, storageWarning, resetSession };
}
