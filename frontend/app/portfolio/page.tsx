"use client";

import { useEffect, useRef, useState } from "react";
import StockModal from "@/components/StockModal";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { useApi } from "@/lib/api";

const BROKER_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  fidelity:    { label: "Fidelity",     color: "text-green-400",  bg: "bg-green-400/10 border-green-400/30"  },
  etrade:      { label: "E*Trade",      color: "text-blue-400",   bg: "bg-blue-400/10 border-blue-400/30"   },
  etrade_espp: { label: "E*Trade ESPP", color: "text-purple-400", bg: "bg-purple-400/10 border-purple-400/30" },
};

const CASH_SYMBOLS = new Set(["SPAXX", "FDRXX", "FCASH", "CORE**", "MMDA1", "MMDA4", "SWEEP"]);

const SECTOR_COLORS = [
  "#10b981","#3b82f6","#f59e0b","#8b5cf6",
  "#ef4444","#06b6d4","#f97316","#84cc16","#ec4899","#6b7280",
];

const signalConfig: Record<string, { classes: string; icon: string }> = {
  "Strong Buy":  { classes: "text-emerald-400 bg-emerald-400/10", icon: "▲▲" },
  "Buy":         { classes: "text-green-400 bg-green-400/10",     icon: "▲"  },
  "Watch":       { classes: "text-yellow-400 bg-yellow-400/10",   icon: "◎"  },
  "Neutral":     { classes: "text-gray-400 bg-gray-400/10",       icon: "─"  },
  "Sell":        { classes: "text-orange-400 bg-orange-400/10",   icon: "▼"  },
  "Strong Sell": { classes: "text-red-400 bg-red-400/10",         icon: "▼▼" },
};

function fmt(val: any, decimals = 2) {
  if (val === null || val === undefined) return "—";
  return typeof val === "number" ? val.toFixed(decimals) : val;
}
function fmtMoney(val: number | null | undefined) {
  if (val === null || val === undefined) return "—";
  const abs = Math.abs(val);
  const sign = val < 0 ? "-" : "+";
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(2)}`;
}
function fmtValue(val: number | null | undefined) {
  if (val === null || val === undefined) return "—";
  if (val >= 1e6) return `$${(val / 1e6).toFixed(2)}M`;
  if (val >= 1e3) return `$${(val / 1e3).toFixed(1)}K`;
  return `$${val.toFixed(2)}`;
}

// ── Import Modal ──────────────────────────────────────────────────────────────
function ImportModal({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const api = useApi();
  const [file, setFile] = useState<File | null>(null);
  const [detectedBroker, setDetectedBroker] = useState<string | null>(null);
  const [accountLabel, setAccountLabel] = useState("");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  const detectBroker = (f: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const firstLine = (e.target?.result as string).split("\n")[0] || "";
      const headers = firstLine.split(",").map(h => h.trim().replace(/^"|"$/g, ""));
      const broker = headers.includes("Purchased Qty.") || headers.includes("Est. Market Value")
        ? "etrade_espp"
        : headers.includes("Market Value") || headers.includes("Unit Cost")
        ? "etrade"
        : "fidelity";
      setDetectedBroker(broker);
    };
    reader.readAsText(f.slice(0, 2048));
  };

  const handleFile = (f: File) => {
    setFile(f);
    setResult(null);
    setError(null);
    detectBroker(f);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  };

  const doImport = async () => {
    if (!file) return;
    setImporting(true);
    setError(null);
    const form = new FormData();
    form.append("file", file);
    form.append("account_label", accountLabel);
    try {
      const res = await api.post("/api/portfolio/import", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setResult(`✓ ${res.data.message}`);
      onImported();
    } catch {
      setError("Import failed — check the file format.");
    } finally {
      setImporting(false);
    }
  };

  const brokerInfo = detectedBroker ? BROKER_CONFIG[detectedBroker] : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-md p-6 shadow-2xl animate-fade-in">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-white">Import Portfolio</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-xl leading-none">✕</button>
        </div>

        {/* Drop zone */}
        <div
          ref={dropRef}
          onDrop={handleDrop}
          onDragOver={e => e.preventDefault()}
          onClick={() => document.getElementById("portfolio-file-input")?.click()}
          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors mb-4 ${
            file ? "border-emerald-500/50 bg-emerald-500/5" : "border-gray-700 hover:border-gray-500"
          }`}
        >
          <input
            id="portfolio-file-input"
            type="file"
            accept=".csv"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />
          {file ? (
            <div>
              <p className="text-emerald-400 font-medium text-sm">📄 {file.name}</p>
              <p className="text-gray-500 text-xs mt-1">{(file.size / 1024).toFixed(1)} KB</p>
            </div>
          ) : (
            <div>
              <p className="text-gray-400 text-sm font-medium">Drop your CSV here or click to browse</p>
              <p className="text-gray-600 text-xs mt-1">Supports Fidelity and E*Trade exports</p>
            </div>
          )}
        </div>

        {/* Detected broker */}
        {detectedBroker && brokerInfo && (
          <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 mb-4 text-sm ${brokerInfo.bg}`}>
            <span className={`font-semibold ${brokerInfo.color}`}>✓ {brokerInfo.label} format detected</span>
          </div>
        )}

        {/* Account label for E*Trade */}
        {detectedBroker === "etrade" && (
          <div className="mb-4">
            <label className="text-xs text-gray-500 uppercase tracking-wider block mb-1">
              Account Label <span className="text-gray-600 normal-case">(e.g. "E*Trade IRA")</span>
            </label>
            <input
              type="text"
              value={accountLabel}
              onChange={e => setAccountLabel(e.target.value)}
              placeholder="E*Trade Brokerage"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-emerald-500"
            />
            <p className="text-xs text-gray-600 mt-1">Re-importing with the same label will replace those positions.</p>
          </div>
        )}

        {/* Instructions */}
        {!file && (
          <div className="mb-4 rounded-lg bg-gray-800/50 px-4 py-3 text-xs text-gray-500 space-y-1">
            <p className="font-semibold text-gray-400 mb-1">How to export:</p>
            <p><span className="text-gray-300">Fidelity:</span> Accounts → Portfolio → Positions → Download CSV</p>
            <p><span className="text-gray-300">E*Trade:</span> My Portfolio → Holdings → Download → Positions CSV</p>
          </div>
        )}

        {result && <p className="text-emerald-400 text-sm mb-4">{result}</p>}
        {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

        <div className="flex gap-3">
          <button
            onClick={doImport}
            disabled={!file || importing || (detectedBroker === "etrade" && !accountLabel.trim())}
            className="flex-1 bg-emerald-500 hover:bg-emerald-600 disabled:bg-gray-800 disabled:text-gray-600 text-white font-semibold py-2.5 rounded-xl transition-colors text-sm"
          >
            {importing ? "Importing…" : "Import"}
          </button>
          {result && (
            <button onClick={onClose} className="flex-1 bg-gray-800 hover:bg-gray-700 text-white font-semibold py-2.5 rounded-xl text-sm">
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function PortfolioPage() {
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [positions, setPositions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showImport, setShowImport] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [accountFilter, setAccountFilter] = useState("all");
  const [brokerFilter, setBrokerFilter] = useState("all");
  const [sortKey, setSortKey] = useState("current_value");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const api = useApi();

  const fetchPortfolio = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.get("/api/portfolio/", { timeout: 60000 });
      setPositions(res.data);
      setLastUpdated(new Date());
    } catch {
      setError("Failed to load portfolio. Is the backend running?");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchPortfolio(); }, []);

  const brokers = Array.from(new Set(positions.map(p => p.broker).filter(Boolean)));
  const accounts = Array.from(new Set(positions.map(p => p.account_name).filter(Boolean)));

  const filtered = positions
    .filter(p => brokerFilter === "all" || p.broker === brokerFilter)
    .filter(p => accountFilter === "all" || p.account_name === accountFilter);

  const sorted = [...filtered].sort((a, b) => {
    let av: any, bv: any;
    if (sortKey === "current_value")   { av = a.current_value;              bv = b.current_value; }
    else if (sortKey === "total_gl_dollar") { av = a.total_gl_dollar;       bv = b.total_gl_dollar; }
    else if (sortKey === "total_gl_pct")    { av = a.total_gl_pct;          bv = b.total_gl_pct; }
    else if (sortKey === "oversold_score")  { av = a.analysis?.oversold_score ?? -1; bv = b.analysis?.oversold_score ?? -1; }
    else { av = a[sortKey]; bv = b[sortKey]; }
    if (av == null) return 1;
    if (bv == null) return -1;
    return sortDir === "desc" ? bv - av : av - bv;
  });

  const handleSort = (key: string) => {
    if (sortKey === key) setSortDir(d => d === "desc" ? "asc" : "desc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  // Consolidated stats (respect broker + account filter)
  const totalValue  = filtered.reduce((s, p) => s + (p.current_value || 0), 0);
  const totalGL     = filtered.reduce((s, p) => s + (p.total_gl_dollar || 0), 0);
  const totalCost   = filtered.reduce((s, p) => s + (p.cost_basis_total || 0), 0);
  const totalGLPct  = totalCost > 0 ? (totalGL / totalCost * 100) : 0;

  // Per-broker breakdown (always uses full positions, not filtered)
  const brokerStats = brokers.map(b => {
    const bp = positions.filter(p => p.broker === b);
    return {
      broker: b,
      value: bp.reduce((s, p) => s + (p.current_value || 0), 0),
      gl: bp.reduce((s, p) => s + (p.total_gl_dollar || 0), 0),
      count: bp.length,
    };
  });

  // Sector allocation
  const sectorMap: Record<string, number> = {};
  for (const p of filtered) {
    const sector = p.analysis?.sector || "Unknown";
    sectorMap[sector] = (sectorMap[sector] || 0) + (p.current_value || 0);
  }
  const sectorData = Object.entries(sectorMap)
    .map(([sector, value]) => ({
      sector,
      value: parseFloat(value.toFixed(2)),
      pct: parseFloat((value / totalValue * 100).toFixed(1)),
    }))
    .sort((a, b) => b.value - a.value);

  const SortTh = ({ label, col }: { label: string; col: string }) => (
    <th
      className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider cursor-pointer hover:text-emerald-400 select-none whitespace-nowrap"
      onClick={() => handleSort(col)}
    >
      {label} {sortKey === col ? (sortDir === "desc" ? "↓" : "↑") : ""}
    </th>
  );

  return (
    <main className="min-h-screen bg-transparent text-white p-8">
      <div className="max-w-7xl mx-auto">

        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div className="relative">
            <div className="absolute -top-6 -left-4 w-72 h-28 bg-emerald-500/8 rounded-full blur-3xl pointer-events-none" />
            <div className="relative">
              <h1 className="text-4xl font-extrabold mb-1 tracking-tight bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">
                Portfolio
              </h1>
              <p className="text-gray-500 text-sm">
                Consolidated across all brokers · live analysis overlaid
              </p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex gap-2">
              <button
                onClick={fetchPortfolio}
                disabled={loading}
                className="text-sm px-4 py-2 rounded-lg border border-gray-700 text-gray-300 hover:border-emerald-500 hover:text-emerald-400 transition-colors disabled:opacity-50"
              >
                {loading ? "Refreshing…" : "↺ Refresh"}
              </button>
              <button
                onClick={() => setShowImport(true)}
                className="text-sm px-4 py-2 rounded-lg border border-gray-700 text-gray-300 hover:border-emerald-500 hover:text-emerald-400 transition-colors"
              >
                ↑ Import CSV
              </button>
            </div>
            {lastUpdated && (
              <p className="text-xs text-gray-600">Updated {lastUpdated.toLocaleTimeString()}</p>
            )}
          </div>
        </div>

        {showImport && (
          <ImportModal
            onClose={() => setShowImport(false)}
            onImported={() => { fetchPortfolio(); }}
          />
        )}

        {/* Empty state */}
        {!loading && positions.length === 0 && (
          <div
            onClick={() => setShowImport(true)}
            className="border-2 border-dashed border-gray-700 rounded-xl p-16 text-center hover:border-emerald-500 transition-colors cursor-pointer"
          >
            <p className="text-gray-400 text-lg mb-2">No positions imported yet</p>
            <p className="text-gray-600 text-sm">Click to import from Fidelity or E*Trade</p>
          </div>
        )}

        {loading && (
          <div className="flex items-center gap-3 text-gray-400 mt-20 justify-center">
            <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            Loading portfolio with live analysis…
          </div>
        )}

        {!loading && positions.length > 0 && (
          <>
            {/* ── Summary Cards ── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-4">
                <p className="text-gray-500 text-xs uppercase tracking-wider mb-1">Total Value</p>
                <p className="text-2xl font-bold text-white font-mono">{fmtValue(totalValue)}</p>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-4">
                <p className="text-gray-500 text-xs uppercase tracking-wider mb-1">Total G/L</p>
                <p className={`text-2xl font-bold font-mono ${totalGL >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {fmtMoney(totalGL)}
                </p>
                <p className={`text-xs font-mono mt-0.5 ${totalGL >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                  {totalGL >= 0 ? "+" : ""}{totalGLPct.toFixed(2)}%
                </p>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-4">
                <p className="text-gray-500 text-xs uppercase tracking-wider mb-1">Cost Basis</p>
                <p className="text-2xl font-bold text-white font-mono">{fmtValue(totalCost)}</p>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-4">
                <p className="text-gray-500 text-xs uppercase tracking-wider mb-1">Positions</p>
                <p className="text-2xl font-bold text-white font-mono">{filtered.length}</p>
                {brokers.length > 1 && (
                  <p className="text-xs text-gray-600 mt-0.5">{brokers.length} brokers</p>
                )}
              </div>
            </div>

            {/* ── Broker + Sector panels ── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">

              {/* Broker breakdown — only shown when multi-broker */}
              {brokers.length > 1 && (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">By Broker</h3>
                  <div className="space-y-3">
                    {brokerStats.map(b => {
                      const cfg = BROKER_CONFIG[b.broker] || BROKER_CONFIG.fidelity;
                      const pct = totalValue > 0 ? (b.value / totalValue * 100) : 0;
                      return (
                        <div key={b.broker}>
                          <div className="flex justify-between text-xs mb-1">
                            <span className={`font-semibold ${cfg.color}`}>{cfg.label}</span>
                            <span className="text-gray-400">{pct.toFixed(1)}%</span>
                          </div>
                          <div className="h-1.5 bg-gray-800 rounded-full mb-1">
                            <div className="h-1.5 rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
                          </div>
                          <div className="flex justify-between text-xs text-gray-500">
                            <span>{b.count} positions</span>
                            <span className="font-mono">{fmtValue(b.value)}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Sector allocation */}
              <div className={`bg-gray-900 border border-gray-800 rounded-xl p-5 ${brokers.length > 1 ? "" : "lg:col-span-1"}`}>
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">Sector Allocation</h3>
                {sectorData.map((s, i) => (
                  <div key={s.sector} className="mb-2.5">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-gray-400 truncate max-w-[160px]">{s.sector}</span>
                      <span className="text-gray-500 font-mono">{s.pct}%</span>
                    </div>
                    <div className="h-1.5 bg-gray-800 rounded-full">
                      <div className="h-1.5 rounded-full" style={{ width: `${s.pct}%`, backgroundColor: SECTOR_COLORS[i % SECTOR_COLORS.length] }} />
                    </div>
                  </div>
                ))}
              </div>

              {/* Account breakdown */}
              <div className={`bg-gray-900 border border-gray-800 rounded-xl p-5 ${brokers.length > 1 ? "" : "lg:col-span-2"}`}>
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">By Account</h3>
                <div className="space-y-2">
                  {accounts.map(acct => {
                    const ap = positions.filter(p => p.account_name === acct);
                    const acctValue = ap.reduce((s, p) => s + (p.current_value || 0), 0);
                    const acctGL    = ap.reduce((s, p) => s + (p.total_gl_dollar || 0), 0);
                    const acctPct   = totalValue > 0 ? (acctValue / totalValue * 100) : 0;
                    const broker    = ap[0]?.broker || "fidelity";
                    const cfg       = BROKER_CONFIG[broker] || BROKER_CONFIG.fidelity;
                    return (
                      <div key={acct} className="flex items-center justify-between py-2 border-b border-gray-800 last:border-0">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${cfg.bg} ${cfg.color}`}>
                              {cfg.label}
                            </span>
                            <p className="text-white text-sm font-medium truncate">{acct}</p>
                          </div>
                          <p className="text-gray-600 text-xs mt-0.5">{ap.length} positions · {acctPct.toFixed(1)}%</p>
                        </div>
                        <div className="text-right shrink-0 ml-4">
                          <p className="text-white font-semibold font-mono text-sm">{fmtValue(acctValue)}</p>
                          <p className={`text-xs font-mono ${acctGL >= 0 ? "text-emerald-400" : "text-red-400"}`}>{fmtMoney(acctGL)}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* ── Filters ── */}
            <div className="flex flex-wrap items-center gap-3 mb-4">
              {/* Broker filter */}
              {brokers.length > 1 && (
                <div className="flex items-center gap-1.5">
                  {["all", ...brokers].map(b => {
                    const cfg = b === "all" ? null : BROKER_CONFIG[b];
                    return (
                      <button
                        key={b}
                        onClick={() => { setBrokerFilter(b); setAccountFilter("all"); }}
                        className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                          brokerFilter === b
                            ? "bg-emerald-500 border-emerald-500 text-white"
                            : "border-gray-700 text-gray-400 hover:text-white"
                        }`}
                      >
                        {b === "all" ? "All Brokers" : cfg?.label}
                      </button>
                    );
                  })}
                  <span className="text-gray-700 text-xs">|</span>
                </div>
              )}

              {/* Account filter */}
              {accounts
                .filter(a => brokerFilter === "all" || positions.find(p => p.account_name === a)?.broker === brokerFilter)
                .map(a => (
                  <button
                    key={a}
                    onClick={() => setAccountFilter(accountFilter === a ? "all" : a)}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                      accountFilter === a
                        ? "bg-emerald-500 text-white"
                        : "bg-gray-800 text-gray-400 hover:text-white"
                    }`}
                  >
                    {a}
                  </button>
                ))}
            </div>

            {/* ── Positions Table ── */}
            <div className="overflow-x-auto rounded-xl border border-gray-800">
              <table className="w-full text-sm">
                <thead className="bg-gray-900 border-b border-gray-800">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Stock</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Shares</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Avg Cost</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Last Price</th>
                    <SortTh label="Value" col="current_value" />
                    <SortTh label="G/L $" col="total_gl_dollar" />
                    <SortTh label="G/L %" col="total_gl_pct" />
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Signal</th>
                    <SortTh label="Score" col="oversold_score" />
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">RSI</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Account</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {sorted.map(p => {
                    const a = p.analysis;
                    const glPos = (p.total_gl_dollar || 0) >= 0;
                    const isCash = CASH_SYMBOLS.has(p.ticker);
                    const sig = a ? (signalConfig[a.signal] || signalConfig["Neutral"]) : null;
                    const brokerCfg = BROKER_CONFIG[p.broker] || BROKER_CONFIG.fidelity;
                    return (
                      <tr key={p.id} className="bg-gray-950 hover:bg-gray-900 transition-colors">
                        {/* Stock */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {a?.is_absolute_steal && <span title="Absolute Steal">🔥</span>}
                            {a?.is_overbought && <span title="Overbought">⚠️</span>}
                            <div>
                              <div
                                onClick={() => !isCash && setSelectedTicker(p.ticker)}
                                className={`font-bold text-white ${!isCash ? "hover:text-emerald-400 cursor-pointer transition-colors" : ""}`}
                              >
                                {p.ticker}
                              </div>
                              <div className="text-gray-500 text-xs truncate max-w-[150px]">{p.company_name}</div>
                            </div>
                          </div>
                        </td>
                        {/* Shares */}
                        <td className="px-4 py-3 text-gray-300 font-mono text-xs">{fmt(p.shares)}</td>
                        {/* Avg Cost */}
                        <td className="px-4 py-3 text-gray-300 font-mono text-xs">{p.avg_cost ? `$${fmt(p.avg_cost)}` : "—"}</td>
                        {/* Last Price */}
                        <td className="px-4 py-3">
                          {a?.current_price != null ? (
                            <div>
                              <span className="text-white font-mono text-xs">${fmt(a.current_price)}</span>
                              {a.price_change_pct != null && (
                                <span className={`block text-xs font-mono ${a.price_change_pct >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                                  {a.price_change_pct >= 0 ? "+" : ""}{fmt(a.price_change_pct)}%
                                </span>
                              )}
                            </div>
                          ) : p.last_price ? (
                            <span className="text-gray-400 font-mono text-xs">${fmt(p.last_price)}</span>
                          ) : "—"}
                        </td>
                        {/* Value */}
                        <td className="px-4 py-3 text-white font-semibold font-mono text-xs">
                          {p.current_value ? `$${p.current_value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}
                        </td>
                        {/* G/L $ */}
                        <td className={`px-4 py-3 font-mono text-xs font-medium ${glPos ? "text-emerald-400" : "text-red-400"}`}>
                          {p.total_gl_dollar != null ? fmtMoney(p.total_gl_dollar) : "—"}
                        </td>
                        {/* G/L % */}
                        <td className={`px-4 py-3 font-mono text-xs font-medium ${glPos ? "text-emerald-400" : "text-red-400"}`}>
                          {p.total_gl_pct != null ? `${p.total_gl_pct >= 0 ? "+" : ""}${fmt(p.total_gl_pct)}%` : "—"}
                        </td>
                        {/* Signal */}
                        <td className="px-4 py-3">
                          {sig ? (
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 w-fit ${sig.classes}`}>
                              <span className="opacity-60 text-[10px]">{sig.icon}</span>
                              {a.signal}
                            </span>
                          ) : isCash ? (
                            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-400/10 text-blue-400">Cash</span>
                          ) : <span className="text-gray-600 text-xs">—</span>}
                        </td>
                        {/* Score */}
                        <td className="px-4 py-3">
                          {a ? (
                            <div className="flex items-center gap-2">
                              <div className="w-12 h-1.5 bg-gray-800 rounded-full">
                                <div className="h-1.5 rounded-full bg-emerald-500" style={{ width: `${a.oversold_score}%` }} />
                              </div>
                              <span className="text-white font-mono text-xs">{a.oversold_score}</span>
                            </div>
                          ) : "—"}
                        </td>
                        {/* RSI */}
                        <td className={`px-4 py-3 font-mono text-xs font-medium ${
                          a?.technicals?.rsi < 30 ? "text-emerald-400" :
                          a?.technicals?.rsi > 70 ? "text-red-400" : "text-gray-300"
                        }`}>
                          {a ? fmt(a.technicals?.rsi) : "—"}
                        </td>
                        {/* Account */}
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-1">
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border w-fit ${brokerCfg.bg} ${brokerCfg.color}`}>
                              {brokerCfg.label}
                            </span>
                            <span className="text-gray-500 text-xs truncate max-w-[120px]">{p.account_name}</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
      <StockModal ticker={selectedTicker} onClose={() => setSelectedTicker(null)} />
    </main>
  );
}
