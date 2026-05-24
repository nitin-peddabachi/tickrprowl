"use client";

import { useState } from "react";
import PriceChart from "@/components/PriceChart";
import { useApi } from "@/lib/api";
import StockModal from "@/components/StockModal";

interface Props {
  item: any;
  onRemove: (ticker: string) => void;
}

const signalColors: Record<string, string> = {
  "Strong Buy": "text-[var(--buy)] bg-[var(--amber-glow)] border-[var(--buy)]/40",
  "Buy": "text-[var(--buy)] bg-[var(--amber-glow)] border-[var(--buy)]/40",
  "Watch": "text-[var(--warn)] bg-[var(--warn)]/10 border-[var(--warn)]/30",
  "Neutral": "text-[var(--paper-fade)] bg-[var(--paper-fade)]/10 border-[var(--paper-fade)]/30",
};

function fmt(val: any, decimals = 2) {
  if (val === null || val === undefined) return "—";
  return typeof val === "number" ? val.toFixed(decimals) : val;
}

export default function WatchlistCard({ item, onRemove }: Props) {
  const { ticker, company_name, sector, notes, target_price, added_at, analysis } = item;
  const [modalOpen, setModalOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [editNotes, setEditNotes] = useState(notes || "");
  const [editTarget, setEditTarget] = useState(target_price || "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const api = useApi();

  const signal = analysis?.signal || "—";
  const signalClass = signalColors[signal] || "text-[var(--paper-fade)] bg-[var(--paper-fade)]/10 border-[var(--paper-fade)]/30";
  const currentPrice = analysis?.current_price;
  const targetNum = parseFloat(editTarget);
  // Fall back to analyst consensus target when no user target is set
  const displayTarget = targetNum > 0 ? targetNum : analysis?.analyst?.target_mean ?? null;
  const targetLabel = targetNum > 0 ? "Target" : "Analyst Target";
  const upside = currentPrice && displayTarget ? ((displayTarget - currentPrice) / currentPrice * 100).toFixed(1) : null;

  const saveNotes = async () => {
    setSaving(true);
    await api.patch(`/api/watchlist/${ticker}`, {
      ticker,
      notes: editNotes,
      target_price: targetNum || null,
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="bg-[var(--ink-surface)] border border-[var(--ink-hairline)] rounded-none overflow-hidden">
      {/* Header row */}
      <div className="flex items-center justify-between p-5">
        <div className="flex items-center gap-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 onClick={() => setModalOpen(true)} className="text-xl font-bold text-[var(--paper)] hover:text-[var(--amber)] cursor-pointer transition-colors">{ticker}</h2>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-none border ${signalClass}`}>
                {signal}
              </span>
              {analysis?.is_absolute_steal && (
                <span className="text-xs font-bold px-2 py-0.5 rounded-none border border-amber-400/40 bg-amber-400/10 text-amber-300">
                  🔥 Absolute Steal
                </span>
              )}
              {analysis?.is_overbought && (
                <span className="text-xs font-bold px-2 py-0.5 rounded-none border border-red-500/40 bg-red-500/10 text-red-300">
                  ⚠️ Overbought
                </span>
              )}
            </div>
            <p className="text-[var(--paper-fade)] text-sm">{company_name} · {sector}</p>
          </div>
        </div>

        <div className="flex items-center gap-6">
          {/* Price info */}
          {currentPrice && (
            <div className="text-right">
              <p className="text-xl font-bold text-[var(--paper)]">${fmt(currentPrice)}</p>
              <p className="text-xs text-[var(--paper-fade)]">
                RSI: <span className={`font-medium ${analysis.technicals.rsi < 30 ? "text-[var(--buy)]" : analysis.technicals.rsi > 70 ? "text-[var(--sell)]" : "text-[var(--paper)]"}`}>
                  {fmt(analysis.technicals.rsi)}
                </span>
              </p>
            </div>
          )}

          {/* Target price */}
          {displayTarget && currentPrice && (
            <div className="text-right">
              <p className="text-sm text-[var(--paper-fade)]">{targetLabel}: <span className="text-[var(--paper)] font-medium">${typeof displayTarget === "number" ? displayTarget.toFixed(2) : displayTarget}</span></p>
              <p className={`text-xs font-medium ${parseFloat(upside!) >= 0 ? "text-[var(--buy)]" : "text-[var(--sell)]"}`}>
                {upside}% upside
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-[var(--paper-fade)] hover:text-[var(--paper)] text-sm px-3 py-1.5 rounded-none border border-[var(--ink-hairline)] hover:border-[var(--amber)] transition-colors"
            >
              {expanded ? "Collapse" : "Details"}
            </button>
            <button
              onClick={() => onRemove(ticker)}
              className="text-[var(--sell)] hover:text-red-300 text-sm px-3 py-1.5 rounded-none border border-red-900 hover:border-red-700 transition-colors"
            >
              Remove
            </button>
          </div>
        </div>
      </div>

      {/* Oversold score bar */}
      {analysis && (
        <div className="px-5 pb-3">
          <div className="flex justify-between text-xs mb-1">
            <span className="text-[var(--paper-vapor)]">Oversold Score</span>
            <span className="text-[var(--paper-fade)]">{analysis.oversold_score}/100</span>
          </div>
          <div className="h-[3px] bg-[var(--ink-raised)]">
            <div className="h-[3px] bg-[var(--amber)]" style={{ width: `${analysis.oversold_score}%` }} />
          </div>
        </div>
      )}

      {/* Expanded details */}
      {expanded && analysis && (
        <div className="border-t border-[var(--ink-hairline)] p-5 space-y-5">
          {/* Notes & Target */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-[var(--paper-fade)] uppercase tracking-wider">Notes</label>
              <textarea
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                placeholder="Add your notes..."
                rows={2}
                className="mt-1 w-full bg-[var(--ink-raised)] border border-[var(--ink-hairline)] rounded-none px-3 py-2 text-sm text-[var(--paper)] placeholder-[var(--paper-vapor)] focus:outline-none focus:border-[var(--amber)] resize-none"
              />
            </div>
            <div>
              <label className="text-xs text-[var(--paper-fade)] uppercase tracking-wider">Target Price ($)</label>
              <input
                type="number"
                value={editTarget}
                onChange={(e) => setEditTarget(e.target.value)}
                placeholder="e.g. 200"
                className="mt-1 w-full bg-[var(--ink-raised)] border border-[var(--ink-hairline)] rounded-none px-3 py-2 text-sm text-[var(--paper)] placeholder-[var(--paper-vapor)] focus:outline-none focus:border-[var(--amber)]"
              />
            </div>
          </div>
          <button
            onClick={saveNotes}
            disabled={saving}
            className="text-sm bg-[var(--ink-raised)] hover:bg-[var(--ink-divider)] text-[var(--paper)] px-4 py-2 rounded-none transition-colors"
          >
            {saved ? "Saved!" : saving ? "Saving..." : "Save Notes & Target"}
          </button>

          {/* Key metrics */}
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-[var(--paper-fade)] uppercase tracking-wider">Technicals</h4>
              <div className="flex justify-between"><span className="text-[var(--paper-fade)]">RSI</span><span className="text-[var(--paper)]">{fmt(analysis.technicals.rsi)}</span></div>
              <div className="flex justify-between"><span className="text-[var(--paper-fade)]">BB %</span><span className="text-[var(--paper)]">{fmt(analysis.technicals.bb_percent, 3)}</span></div>
              <div className="flex justify-between"><span className="text-[var(--paper-fade)]">From High</span><span className="text-[var(--paper)]">{fmt(analysis.pct_from_52w_high)}%</span></div>
            </div>
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-[var(--paper-fade)] uppercase tracking-wider">Fundamentals</h4>
              <div className="flex justify-between"><span className="text-[var(--paper-fade)]">P/E</span><span className="text-[var(--paper)]">{fmt(analysis.fundamentals.pe_ratio)}</span></div>
              <div className="flex justify-between"><span className="text-[var(--paper-fade)]">Fwd P/E</span><span className="text-[var(--paper)]">{fmt(analysis.fundamentals.forward_pe)}</span></div>
              <div className="flex justify-between"><span className="text-[var(--paper-fade)]">Rev Growth</span>
                <span className={analysis.fundamentals.revenue_growth > 0 ? "text-[var(--buy)]" : "text-[var(--sell)]"}>
                  {analysis.fundamentals.revenue_growth !== null ? `${(analysis.fundamentals.revenue_growth * 100).toFixed(1)}%` : "—"}
                </span>
              </div>
            </div>
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-[var(--paper-fade)] uppercase tracking-wider">Info</h4>
              <div className="flex justify-between"><span className="text-[var(--paper-fade)]">52w High</span><span className="text-[var(--paper)]">${fmt(analysis.price_52w_high)}</span></div>
              <div className="flex justify-between"><span className="text-[var(--paper-fade)]">52w Low</span><span className="text-[var(--paper)]">${fmt(analysis.price_52w_low)}</span></div>
              <div className="flex justify-between"><span className="text-[var(--paper-fade)]">Added</span><span className="text-[var(--paper)]">{added_at?.slice(0, 10)}</span></div>
            </div>
          </div>

          <PriceChart ticker={ticker} />
        </div>
      )}
    <StockModal ticker={modalOpen ? ticker : null} onClose={() => setModalOpen(false)} />
    </div>
  );
}
