import { formatChips } from "./format";

type Props = {
  enabled: boolean;
  canRaise: boolean;
  facing: boolean;
  isBet: boolean;
  callAmount: number;
  allInCall: boolean;
  min: number;
  max: number;
  raiseTo: number;
  presets: { label: string; key: string; value: number }[];
  inBB: boolean;
  onRaiseTo: (value: number) => void;
  onFold: () => void;
  onCall: () => void;
  onRaise: () => void;
};

export function ActionBar({ enabled, canRaise, facing, isBet, callAmount, allInCall, min, max, raiseTo, presets, inBB, onRaiseTo, onFold, onCall, onRaise }: Props) {
  const sizing = enabled && canRaise;
  const chips = (amount: number) => formatChips(amount, inBB);
  return (
    <section className="action-area" aria-label="Your action">
      <div className="size-row">
        {presets.map((preset) => (
          <button key={preset.key} className={`size ${preset.value === raiseTo ? "selected" : ""}`} aria-keyshortcuts={preset.key} title={`${preset.label} · shortcut ${preset.key.toUpperCase()}`} disabled={!sizing} onClick={() => onRaiseTo(preset.value)}>{preset.label}</button>
        ))}
        <input className="size-slider" aria-label="Raise amount" type="range" min={min} max={Math.max(min, max)} value={raiseTo} disabled={!sizing} onChange={(event) => onRaiseTo(Number(event.target.value))} />
      </div>
      <div className="button-row">
        <button className="act" title="Shortcut F" disabled={!enabled} onClick={onFold}>Fold</button>
        <button className="act call" title="Shortcut C" disabled={!enabled} onClick={onCall}>{facing ? `Call ${chips(callAmount)}${allInCall ? " · all-in" : ""}` : "Check"}</button>
        <button className="act brass" title="Shortcut R" disabled={!sizing} onClick={onRaise}>{isBet ? "Raise to" : "Bet"} {chips(raiseTo)}</button>
      </div>
    </section>
  );
}
