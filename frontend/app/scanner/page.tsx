"use client";

import { useState } from "react";
import { publicApi } from "@/lib/api";
import ScannerTable from "@/components/ScannerTable";

const PRESETS = [
  { key: "sp500_sample", label: "S&P 500 Sample (40 stocks)" },
  { key: "tech", label: "Tech Sector (20 stocks)" },
  { key: "value", label: "Value Stocks (20 stocks)" },
];

export default function ScannerPage() {
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [activePreset, setActivePreset] = useState("");
  const [customTickers, setCustomTickers] = useState("");
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [hasScanned, setHasScanned] = useState(false);
  const [scannedCount, setScannedCount] = useState(0);

  const runPreset = async (presetKey: string) => {
    setLoading(true);
    setActivePreset(presetKey);
    setError("");
    setProgress("Fetching data...");
    setResults([]);
    try {
      const res = await publicApi.get(`/api/stocks/batch/preset/${presetKey}`);
      setResults(res.data);
      setHasScanned(true);
      setScannedCount(0);
      setProgress("");
    } catch (e: any) {
      setError("Failed to run scan. Is the backend running?");
      setProgress("");
    } finally {
      setLoading(false);
    }
  };

  const runCustom = async () => {
    if (!customTickers.trim()) return;
    const tickerList = customTickers.split(",").map(t => t.trim()).filter(Boolean);
    if (tickerList.length > 50) {
      setError("Too many tickers — limit is 50 per scan");
      return;
    }
    setLoading(true);
    setActivePreset("");
    setError("");
    setProgress("Fetching data...");
    setResults([]);
    try {
      const res = await publicApi.get(`/api/stocks/batch/scan?tickers=${encodeURIComponent(customTickers)}`);
      setResults(res.data);
      setHasScanned(true);
      setScannedCount(tickerList.length);
      setProgress("");
    } catch (e: any) {
      setError("Failed to run scan. Is the backend running?");
      setProgress("");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-transparent text-[var(--paper)] p-8">
      <div className="max-w-6xl mx-auto">
        {/* Page header */}
        <div className="mb-8">
          <h1 className="serif font-bold text-[var(--paper)] text-4xl tracking-tight mb-1">Scanner</h1>
          <p className="text-[var(--paper-fade)]">Scan multiple stocks and rank by oversold score</p>
        </div>

        {/* Preset Buttons */}
        <div className="mb-6">
          <p className="text-sm text-[var(--paper-fade)] mb-3 uppercase tracking-wider">Quick Scan</p>
          <div className="flex flex-wrap gap-3">
            {PRESETS.map((preset) => (
              <button
                key={preset.key}
                onClick={() => runPreset(preset.key)}
                disabled={loading}
                className={`px-4 py-2 rounded-none border text-sm font-medium transition-colors ${
                  activePreset === preset.key
                    ? "bg-[var(--amber)] border-[var(--amber)] text-[var(--ink-bg)]"
                    : "border-[var(--ink-hairline)] text-[var(--paper-fade)] hover:border-[var(--amber)] hover:text-[var(--amber)]"
                } disabled:opacity-50`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        {/* Custom Tickers */}
        <div className="mb-8">
          <p className="text-sm text-[var(--paper-fade)] mb-3 uppercase tracking-wider">Custom Scan</p>
          <div className="flex gap-3">
            <input
              type="text"
              value={customTickers}
              onChange={(e) => setCustomTickers(e.target.value)}
              placeholder="AAPL, MSFT, TSLA, NVDA, ..."
              className="flex-1 bg-[var(--ink-raised)] border border-[var(--ink-hairline)] rounded-none px-4 py-3 text-[var(--paper)] placeholder-[var(--paper-vapor)] focus:outline-none focus:border-[var(--amber)]"
            />
            <button
              onClick={runCustom}
              disabled={loading || !customTickers.trim()}
              className="bg-[var(--amber)] hover:opacity-90 disabled:opacity-40 text-[var(--ink-bg)] font-semibold px-6 py-3 rounded-none transition-opacity"
            >
              {loading ? "Scanning..." : "Scan"}
            </button>
          </div>
        </div>

        {/* Status + Skeleton */}
        {loading && (
          <div>
            <div className="flex items-center gap-3 text-[var(--paper-fade)] mb-4">
              <div className="w-4 h-4 border-2 border-[var(--amber)] border-t-transparent rounded-full animate-spin" />
              <span>{progress || "Analyzing stocks..."}</span>
            </div>
            {/* Skeleton table */}
            <div className="overflow-x-auto rounded-none border border-[var(--ink-hairline)] animate-pulse">
              <table className="w-full text-sm">
                <thead className="bg-[var(--ink-surface)] border-b border-[var(--ink-hairline)]">
                  <tr>
                    {["w-6", "w-4", "w-24", "w-20", "w-16", "w-16", "w-12", "w-16", "w-12", "w-16", "w-16"].map((w, i) => (
                      <th key={i} className="px-4 py-3">
                        <div className={`h-3 bg-[var(--ink-raised)] rounded-none ${w}`} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--ink-hairline)]">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className="bg-[var(--ink-bg)]">
                      <td className="px-4 py-3"><div className="w-4 h-3 bg-[var(--ink-raised)] rounded-none" /></td>
                      <td className="px-3 py-3"><div className="w-6 h-6 bg-[var(--ink-raised)] rounded-full" /></td>
                      <td className="px-4 py-3">
                        <div className="w-12 h-3 bg-[var(--ink-raised)] rounded-none mb-1.5" />
                        <div className="w-24 h-2.5 bg-[var(--ink-raised)]/60 rounded-none" />
                      </td>
                      <td className="px-4 py-3"><div className="w-16 h-5 bg-[var(--ink-raised)] rounded-none" /></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 bg-[var(--ink-raised)] rounded-none" />
                          <div className="w-6 h-3 bg-[var(--ink-raised)] rounded-none" />
                        </div>
                      </td>
                      <td className="px-4 py-3"><div className="w-14 h-3 bg-[var(--ink-raised)] rounded-none" /></td>
                      <td className="px-4 py-3"><div className="w-10 h-3 bg-[var(--ink-raised)] rounded-none" /></td>
                      <td className="px-4 py-3"><div className="w-12 h-3 bg-[var(--ink-raised)] rounded-none" /></td>
                      <td className="px-4 py-3"><div className="w-10 h-3 bg-[var(--ink-raised)] rounded-none" /></td>
                      <td className="px-4 py-3"><div className="w-12 h-3 bg-[var(--ink-raised)] rounded-none" /></td>
                      <td className="px-4 py-3"><div className="w-12 h-3 bg-[var(--ink-raised)] rounded-none" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {error && <p className="text-[var(--sell)] text-sm mb-6">{error}</p>}

        {/* Results */}
        {results.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-4">
                  <p className="text-[var(--paper-fade)] text-sm">
                    {results.length} stocks analyzed
                    {scannedCount > 0 && results.length < scannedCount && (
                      <span className="text-[var(--paper-vapor)] ml-1">({scannedCount - results.length} skipped — no data)</span>
                    )}
                    {" · sorted by oversold score"}
                  </p>
              <div className="flex items-center gap-1.5 flex-wrap">
                {[
                  { signal: "Strong Buy", color: "bg-[var(--amber-glow)] text-[var(--buy)]" },
                  { signal: "Buy",        color: "bg-[var(--amber-glow)] text-[var(--buy)]" },
                  { signal: "Watch",      color: "bg-yellow-400/15 text-yellow-400" },
                  { signal: "Neutral",    color: "bg-gray-600/30 text-[var(--paper-fade)]" },
                  { signal: "Sell",       color: "bg-[var(--sell)]/10 text-[var(--sell)]" },
                  { signal: "Strong Sell",color: "bg-[var(--sell)]/10 text-[var(--sell)]" },
                ].map(({ signal, color }) => {
                  const count = results.filter(s => s.signal === signal).length;
                  if (!count) return null;
                  return (
                    <span key={signal} className={`text-xs font-medium px-2 py-0.5 rounded-none ${color}`}>
                      {count} {signal}
                    </span>
                  );
                })}
              </div>
            </div>
            <ScannerTable stocks={results} />
          </div>
        )}

        {!loading && results.length === 0 && !error && (
          <div className="mt-20 text-center text-[var(--paper-vapor)]">
            {hasScanned ? (
              <>
                <p className="text-lg">No results</p>
                <p className="text-sm mt-1">All scanned stocks had insufficient data or no signals</p>
              </>
            ) : (
              <p className="text-lg">Select a preset or enter tickers to start scanning</p>
            )}
          </div>
        )}

      </div>
    </main>
  );
}
