"use client";
import { useEffect, useEffectEvent } from "react";

const FOCUSABLE = 'button:not(:disabled), input:not(:disabled), select, summary, a[href], [tabindex="0"]';

/** Focuses the open dialog, traps Tab inside it, closes on Escape and restores focus afterwards. */
export function useModalFocus(open: boolean, onClose: () => void) {
  const close = useEffectEvent(onClose);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog?.querySelector<HTMLElement>("button")?.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
      if (event.key !== "Tab") return;
      const targets = Array.from(dialog?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter((target) => target.getClientRects().length);
      const first = targets[0];
      const last = targets.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", trap);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", trap);
      if (previous?.isConnected) previous.focus();
    };
  }, [open]);
}
