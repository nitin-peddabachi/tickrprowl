"use client";

import { useState } from "react";
import axios from "axios";
import PriceChart from "@/components/PriceChart";

interface Props {
  item: any;
  onRemove: (ticker: string) => void;
}

const signalColors: Record<string, string> = {
  "Strong Buy": "text-emerald-400 bg-emerald-400/10 border-emerald-400/30",
  "Buy": "text-green-400 bg-green-400/10 border-green-400/30",
  "Watch": "text-yellow-400 bg-yellow-400/10 border-yellow-400/30",
  "Neutral": "text-gray-400 bg-gray-400/10 border-gray-400/30",
};

function fmt(val: any, decimals = 2) {
  if (val === null || val === undefined) return "—";
  return typeof val === "number" ? val.toFixed(decimals) : val;
}

export default function WatchlistCard({ item, onRemove }: Props) {
  const { ticker, company_name, sector, notes, target_price, added_at, analysis } = item;
  const [expanded, setExpanded] = useState(false);
  const [editNotes, setEditNotes] = useState(notes || "");
  const [editTarget, setEditTarget] = useState(target_price || "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const signal = analysis?.signal || "—";
  const signalClass = signalColors[signal] || "text-gray-400 bg-gray-400/10 border-gray-400/30";
  const currentPrice = analysis?.current_price;
  const targetNum = parseFloat(editTarget);
  const upside = currentPrice && targetNum ? ((targetNum - currentPrice) / currentPrice * 100).toFixed(1) : null;

  const saveNotes = async () => {
    setSaving(true);
    await axios.patch(`http://localhost:8000/api/watchlist/${ticker}`, {
      ticker,
      notes: editNotes,
      target_price: targetNum || null,
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      {/* Header row */}
      <div className="flex items-center justify-between p-5">
        <div className="flex items-center gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-white">{ticker}</h2>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${signalClass}`}>
                {signal}
              </span>
            </div>
            <p className="text-gray-500 text-sm">{company_name} · {sector}</p>
          </div>
        </div>

        <div className="flex items-center gap-6">
          {/* Price info */}
          {currentPrice && (
            <div className="text-right">
              <p className="text-xl font-bold text-white">${fmt(currentPrice)}</p>
              <p className="text-xs text-gray-500">
                RSI: <span className={`font-medium ${analysis.technicals.rsi < 30 ? "text-emerald-400" : analysis.technicals.rsi > 70 ? "text-red-400" : "text-white"}`}>
                  {fmt(analysis.technicals.rsi)}
                </span>
              </p>
            </div>
          )}

          {/* Target price */}
          {targetNum > 0 && currentPrice && (
            <div className="text-right">
              <p className="text-sm text-gray-400">Target: <span className="text-white font-medium">${targetNum}</span></p>
              <p className={`text-xs font-medium ${parseFloat(upside!) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {upside}% upside
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-gray-400 hover:text-white text-sm px-3 py-1.5 rounded-lg border border-gray-700 hover:border-gray-500 transition-colors"
            >
              {expanded ? "Collapse" : "Details"}
            </button>
            <button
              onClick={() => onRemove(ticker)}
              className="text-red-400 hover:text-red-300 text-sm px-3 py-1.5 rounded-lg border border-red-900 hover:border-red-700 transition-colors"
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
            <span className="text-gray-600">Oversold Score</span>
            <span className="text-gray-400">{analysis.oversold_score}/100</span>
          </div>
          <div className="h-1 bg-gray-800 rounded-full">
            <div className="h-1 rounded-full bg-emerald-500" style={{ width: `${analysis.oversold_score}%` }} />
          </div>
        </div>
      )}

      {/* Expanded details */}
      {expanded && analysis && (
        <div className="border-t border-gray-800 p-5 space-y-5">
          {/* Notes & Target */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wider">Notes</label>
              <textarea
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                placeholder="Add your notes..."
                rows={2}
                className="mt-1 w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-emerald-500 resize-none"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 uppercase tracking-wider">Target Price ($)</label>
              <input
                type="number"
                value={editTarget}
                onChange={(e) => setEditTarget(e.target.value)}
                placeholder="e.g. 200"
                className="mt-1 w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>
          <button
            onClick={saveNotes}
            disabled={saving}
            className="text-sm bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-lg transition-colors"
          >
            {saved ? "Saved!" : saving ? "Saving..." : "Save Notes & Target"}
          </button>

          {/* Key metrics */}
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Technicals</h4>
              <div className="flex justify-between"><span className="text-gray-500">RSI</span><span className="text-white">{fmt(analysis.technicals.rsi)}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">BB %</span><span className="text-white">{fmt(analysis.technicals.bb_percent, 3)}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">From High</span><span className="text-white">{fmt(analysis.pct_from_52w_high)}%</span></div>
            </div>
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Fundamentals</h4>
              <div className="flex justify-between"><span className="text-gray-500">P/E</span><span className="text-white">{fmt(analysis.fundamentals.pe_ratio)}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Fwd P/E</span><span className="text-white">{fmt(analysis.fundamentals.forward_pe)}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Rev Growth</span>
                <span className={analysis.fundamentals.revenue_growth > 0 ? "text-emerald-400" : "text-red-400"}>
                  {analysis.fundamentals.revenue_growth !== null ? `${(analysis.fundamentals.revenue_growth * 100).toFixed(1)}%` : "—"}
                </span>
              </div>
            </div>
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Info</h4>
              <div className="flex justify-between"><span className="text-gray-500">52w High</span><span className="text-white">${fmt(analysis.price_52w_high)}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">52w Low</span><span className="text-white">${fmt(analysis.price_52w_low)}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Added</span><span className="text-white">{added_at?.slice(0, 10)}</span></div>
            </div>
          </div>

          <PriceChart ticker={ticker} />
        </div>
      )}
    </div>
  );
}
