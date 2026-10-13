import { useState } from "react";
import { PREFLOP_CHARTS } from "../poker-engine";

const CHART_RANKS = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"];

function chartHand(row: number, column: number) {
  if (row === column) return `${CHART_RANKS[row]}${CHART_RANKS[column]}`;
  const highIndex = Math.min(row, column);
  const lowIndex = Math.max(row, column);
  return `${CHART_RANKS[highIndex]}${CHART_RANKS[lowIndex]}${row < column ? "s" : "o"}`;
}

export function PreflopChartsPanel({ onClose }: { onClose: () => void }) {
  const [chartIndex, setChartIndex] = useState(0);
  const [optionIndex, setOptionIndex] = useState(0);
  const chart = PREFLOP_CHARTS[chartIndex];
  const option = chart.options[Math.min(optionIndex, chart.options.length - 1)];
  const included = new Set(option.hands);
  return (
    <div className="review-overlay" role="dialog" aria-modal="true" aria-labelledby="charts-title">
      <div className="review-panel charts-panel">
        <div className="review-header">
          <div><span className="eyebrow">Decision coach reference</span><h2 id="charts-title">Preflop charts</h2></div>
          <button className="icon-button" onClick={onClose} aria-label="Close preflop charts">×</button>
        </div>
        <p className="review-disclaimer">Unvalidated heuristic ranges; these have not been checked against a matched preflop solver. Exact action order, position, price, effective stack and players still to act can change the recommendation.</p>
        <div className="chart-tabs" role="tablist" aria-label="Preflop chart type">
          {PREFLOP_CHARTS.map((candidate, index) => <button
            key={candidate.id}
            className={index === chartIndex ? "selected" : ""}
            role="tab"
            aria-selected={index === chartIndex}
            onClick={() => { setChartIndex(index); setOptionIndex(0); }}
          >{candidate.label}</button>)}
        </div>
        <div className="chart-heading">
          <div><strong>{chart.label}</strong><p>{chart.description}</p></div>
          <label><span>{chart.selectorLabel}</span><select value={optionIndex} onChange={(event) => setOptionIndex(Number(event.target.value))}>
            {chart.options.map((candidate, index) => <option key={candidate.label} value={index}>{candidate.label}</option>)}
          </select></label>
        </div>
        <div className="range-matrix" aria-label={`${chart.label}, ${option.label}`}>
          {CHART_RANKS.flatMap((_, row) => CHART_RANKS.map((__, column) => {
            const hand = chartHand(row, column);
            return <span key={`${row}-${column}`} className={included.has(hand) ? "included" : ""} aria-label={`${hand}, ${included.has(hand) ? "included" : "not included"}`}>{hand}</span>;
          }))}
        </div>
        <div className="chart-legend"><span><i className="included" />Included in baseline</span><span><i />Usually outside baseline</span></div>
        <p className="range-notation"><strong>Range notation:</strong> “s” means suited, “o” means offsuit, and “+” includes every stronger hand in that family. Current shorthand: {option.specification}.</p>
        <button className="primary wide" onClick={onClose}>Back to table</button>
      </div>
    </div>
  );
}
