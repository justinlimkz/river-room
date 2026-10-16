"use client";

import { useEffect, useRef } from "react";

const SHORTCUTS: [string, string][] = [
  ["F", "Fold"], ["C", "Check or call"], ["R", "Bet or raise"], ["5 / 7 / P / A", "½ pot, ¾ pot, pot, all-in"],
  ["N", "Deal next hand"], ["V", "Review hand / back"], ["Esc", "Close"],
];

type Props = {
  speed: "normal" | "fast";
  inBB: boolean;
  paused: boolean;
  onSpeed: (speed: "normal" | "fast") => void;
  onUnits: () => void;
  onPause: () => void;
  onReset: () => void;
  onClose: () => void;
};

export function SettingsPopover({ speed, inBB, paused, onSpeed, onUnits, onPause, onReset, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const away = (event: PointerEvent) => {
      const target = event.target as HTMLElement;
      if (!ref.current?.contains(target) && !target.closest("[aria-label='Settings']")) onClose();
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [onClose]);

  return (
    <div className="settings-popover" ref={ref} role="group" aria-label="Settings">
      <label>Bot pace
        <select aria-label="Bot pace" value={speed} onChange={(event) => onSpeed(event.target.value === "fast" ? "fast" : "normal")}>
          <option value="normal">Natural</option><option value="fast">Fast</option>
        </select>
      </label>
      <button aria-pressed={inBB} onClick={onUnits}>Show amounts in {inBB ? "dollars" : "big blinds"}</button>
      <button aria-pressed={paused} onClick={onPause}>{paused ? "Resume table" : "Pause table"}</button>
      <dl className="shortcut-list">
        {SHORTCUTS.map(([key, label]) => <div key={key}><dt>{key}</dt><dd>{label}</dd></div>)}
      </dl>
      <button className="danger" onClick={onReset}>Reset session</button>
    </div>
  );
}
