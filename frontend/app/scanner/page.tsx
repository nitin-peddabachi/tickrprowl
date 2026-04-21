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
    <main className="min-h-screen bg-transparent text-white p-8">
      <div className="max-w-6xl mx-auto">
        {/* Page header with glow */}
        <div className="relative mb-8">
          <div className="absolute -top-6 left-0 w-80 h-32 bg-emerald-500/8 rounded-full blur-3xl pointer-events-none" />
          <div className="relative">
            <h1 className="text-4xl font-extrabold mb-1 tracking-tight bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">
              Scanner
            </h1>
            <p className="text-gray-400">Scan multiple stocks and rank by oversold score</p>
          </div>
        </div>

        {/* Preset Buttons */}
        <div className="mb-6">
          <p className="text-sm text-gray-500 mb-3 uppercase tracking-wider">Quick Scan</p>
          <div className="flex flex-wrap gap-3">
            {PRESETS.map((preset) => (
              <button
                key={preset.key}
                onClick={() => runPreset(preset.key)}
                disabled={loading}
                className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                  activePreset === preset.key
                    ? "bg-emerald-500 border-emerald-500 text-white"
                    : "border-gray-700 text-gray-300 hover:border-emerald-500 hover:text-emerald-400"
                } disabled:opacity-50`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        {/* Custom Tickers */}
        <div className="mb-8">
          <p className="text-sm text-gray-500 mb-3 uppercase tracking-wider">Custom Scan</p>
          <div className="flex gap-3">
            <input
              type="text"
              value={customTickers}
              onChange={(e) => setCustomTickers(e.target.value)}
              placeholder="AAPL, MSFT, TSLA, NVDA, ..."
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500"
            />
            <button
              onClick={runCustom}
              disabled={loading || !customTickers.trim()}
              className="bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-800 text-white font-semibold px-6 py-3 rounded-lg transition-colors"
            >
              {loading ? "Scanning..." : "Scan"}
            </button>
          </div>
        </div>

        {/* Status + Skeleton */}
        {loading && (
          <div>
            <div className="flex items-center gap-3 text-gray-400 mb-4">
              <div className="w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
              <span>{progress || "Analyzing stocks..."}</span>
            </div>
            {/* Skeleton table */}
            <div className="overflow-x-auto rounded-xl border border-gray-800 animate-pulse">
              <table className="w-full text-sm">
                <thead className="bg-gray-900 border-b border-gray-800">
                  <tr>
                    {["w-6", "w-4", "w-24", "w-20", "w-16", "w-16", "w-12", "w-16", "w-12", "w-16", "w-16"].map((w, i) => (
                      <th key={i} className="px-4 py-3">
                        <div className={`h-3 bg-gray-800 rounded ${w}`} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className="bg-gray-950">
                      <td className="px-4 py-3"><div className="w-4 h-3 bg-gray-800 rounded" /></td>
                      <td className="px-3 py-3"><div className="w-6 h-6 bg-gray-800 rounded-full" /></td>
                      <td className="px-4 py-3">
                        <div className="w-12 h-3 bg-gray-800 rounded mb-1.5" />
                        <div className="w-24 h-2.5 bg-gray-800/60 rounded" />
                      </td>
                      <td className="px-4 py-3"><div className="w-16 h-5 bg-gray-800 rounded-full" /></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 bg-gray-800 rounded-full" />
                          <div className="w-6 h-3 bg-gray-800 rounded" />
                        </div>
                      </td>
                      <td className="px-4 py-3"><div className="w-14 h-3 bg-gray-800 rounded" /></td>
                      <td className="px-4 py-3"><div className="w-10 h-3 bg-gray-800 rounded" /></td>
                      <td className="px-4 py-3"><div className="w-12 h-3 bg-gray-800 rounded" /></td>
                      <td className="px-4 py-3"><div className="w-10 h-3 bg-gray-800 rounded" /></td>
                      <td className="px-4 py-3"><div className="w-12 h-3 bg-gray-800 rounded" /></td>
                      <td className="px-4 py-3"><div className="w-12 h-3 bg-gray-800 rounded" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {error && <p className="text-red-400 text-sm mb-6">{error}</p>}

        {/* Results */}
        {results.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-4">
                  <p className="text-gray-400 text-sm">
                    {results.length} stocks analyzed
                    {scannedCount > 0 && results.length < scannedCount && (
                      <span className="text-gray-600 ml-1">({scannedCount - results.length} skipped — no data)</span>
                    )}
                    {" · sorted by oversold score"}
                  </p>
              <div className="flex items-center gap-1.5 flex-wrap">
                {[
                  { signal: "Strong Buy", color: "bg-emerald-400/15 text-emerald-400" },
                  { signal: "Buy",        color: "bg-green-400/15 text-green-400" },
                  { signal: "Watch",      color: "bg-yellow-400/15 text-yellow-400" },
                  { signal: "Neutral",    color: "bg-gray-600/30 text-gray-400" },
                  { signal: "Sell",       color: "bg-orange-400/15 text-orange-400" },
                  { signal: "Strong Sell",color: "bg-red-400/15 text-red-400" },
                ].map(({ signal, color }) => {
                  const count = results.filter(s => s.signal === signal).length;
                  if (!count) return null;
                  return (
                    <span key={signal} className={`text-xs font-medium px-2 py-0.5 rounded-full ${color}`}>
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
          <div className="mt-20 text-center text-gray-600">
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
