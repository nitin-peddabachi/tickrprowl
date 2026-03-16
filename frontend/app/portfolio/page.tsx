"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

const API = "http://localhost:8000/api/portfolio";

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

const signalColors: Record<string, string> = {
  "Strong Buy": "text-emerald-400 bg-emerald-400/10",
  "Buy": "text-green-400 bg-green-400/10",
  "Watch": "text-yellow-400 bg-yellow-400/10",
  "Neutral": "text-gray-400 bg-gray-400/10",
};

const SECTOR_COLORS = [
  "#10b981", "#3b82f6", "#f59e0b", "#8b5cf6",
  "#ef4444", "#06b6d4", "#f97316", "#84cc16", "#ec4899", "#6b7280",
];

export default function PortfolioPage() {
  const router = useRouter();
  const [positions, setPositions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const [importMsg, setImportMsg] = useState("");
  const [accountFilter, setAccountFilter] = useState("all");
  const [sortKey, setSortKey] = useState("current_value");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const fileRef = useRef<HTMLInputElement>(null);

  const fetchPortfolio = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/`);
      setPositions(res.data);
    } catch {
      setError("Failed to load portfolio. Is the backend running?");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchPortfolio(); }, []);

  const handleImport = async (file: File) => {
    setImporting(true);
    setImportMsg("");
    setError("");
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await axios.post(`${API}/import`, form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setImportMsg(`✓ ${res.data.message}`);
      await fetchPortfolio();
    } catch {
      setError("Import failed — make sure it's a Fidelity positions CSV.");
    } finally {
      setImporting(false);
    }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleImport(file);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleImport(file);
  };

  // Accounts
  const accounts = ["all", ...Array.from(new Set(positions.map(p => p.account_name)))];

  const filtered = accountFilter === "all"
    ? positions
    : positions.filter(p => p.account_name === accountFilter);

  const sorted = [...filtered].sort((a, b) => {
    let av: any, bv: any;
    if (sortKey === "current_value") { av = a.current_value; bv = b.current_value; }
    else if (sortKey === "total_gl_dollar") { av = a.total_gl_dollar; bv = b.total_gl_dollar; }
    else if (sortKey === "total_gl_pct") { av = a.total_gl_pct; bv = b.total_gl_pct; }
    else if (sortKey === "oversold_score") { av = a.analysis?.oversold_score ?? -1; bv = b.analysis?.oversold_score ?? -1; }
    else { av = a[sortKey]; bv = b[sortKey]; }
    if (av === null || av === undefined) return 1;
    if (bv === null || bv === undefined) return -1;
    return sortDir === "desc" ? bv - av : av - bv;
  });

  const handleSort = (key: string) => {
    if (sortKey === key) setSortDir(d => d === "desc" ? "asc" : "desc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  // Summary stats — reflect the selected account filter
  const totalValue = filtered.reduce((s, p) => s + (p.current_value || 0), 0);
  const totalGL = filtered.reduce((s, p) => s + (p.total_gl_dollar || 0), 0);
  const totalCost = filtered.reduce((s, p) => s + (p.cost_basis_total || 0), 0);
  const totalGLPct = totalCost > 0 ? (totalGL / totalCost * 100) : 0;

  // Sector allocation from live analysis — also filtered
  const sectorMap: Record<string, number> = {};
  for (const p of filtered) {
    const sector = p.analysis?.sector || "Unknown";
    sectorMap[sector] = (sectorMap[sector] || 0) + (p.current_value || 0);
  }
  const sectorData = Object.entries(sectorMap)
    .map(([sector, value]) => ({ sector, value: parseFloat(value.toFixed(2)), pct: parseFloat((value / totalValue * 100).toFixed(1)) }))
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
    <main className="min-h-screen bg-gray-950 text-white p-8">
      <div className="max-w-7xl mx-auto">

        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold text-emerald-400 mb-1">Portfolio</h1>
            <p className="text-gray-400">Imported from Fidelity · live analysis overlaid</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <button
              onClick={() => fileRef.current?.click()}
              disabled={importing}
              className="text-sm px-4 py-2 rounded-lg border border-gray-700 text-gray-300 hover:border-emerald-500 hover:text-emerald-400 transition-colors disabled:opacity-50"
            >
              {importing ? "Importing..." : "↑ Import Fidelity CSV"}
            </button>
            <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={onFileChange} />
            {importMsg && <p className="text-emerald-400 text-xs">{importMsg}</p>}
            {error && <p className="text-red-400 text-xs">{error}</p>}
          </div>
        </div>

        {/* Empty state / drop zone */}
        {!loading && positions.length === 0 && (
          <div
            onDrop={onDrop}
            onDragOver={e => e.preventDefault()}
            className="border-2 border-dashed border-gray-700 rounded-xl p-16 text-center hover:border-emerald-500 transition-colors cursor-pointer"
            onClick={() => fileRef.current?.click()}
          >
            <p className="text-gray-400 text-lg mb-2">Drop your Fidelity CSV here</p>
            <p className="text-gray-600 text-sm">Accounts & Trade → Portfolio → Positions → Download</p>
          </div>
        )}

        {loading && (
          <div className="flex items-center gap-3 text-gray-400 mt-20 justify-center">
            <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            Loading portfolio with live analysis...
          </div>
        )}

        {!loading && positions.length > 0 && (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <div className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-4">
                <p className="text-gray-500 text-sm">Total Value</p>
                <p className="text-2xl font-bold text-white mt-1">{fmtValue(totalValue)}</p>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-4">
                <p className="text-gray-500 text-sm">Total Gain / Loss</p>
                <p className={`text-2xl font-bold mt-1 ${totalGL >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {fmtMoney(totalGL)}
                </p>
                <p className={`text-xs mt-0.5 ${totalGL >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                  {totalGL >= 0 ? "+" : ""}{totalGLPct.toFixed(2)}%
                </p>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-4">
                <p className="text-gray-500 text-sm">Cost Basis</p>
                <p className="text-2xl font-bold text-white mt-1">{fmtValue(totalCost)}</p>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-4">
                <p className="text-gray-500 text-sm">Positions</p>
                <p className="text-2xl font-bold text-white mt-1">{positions.length}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
              {/* Sector Allocation */}
              <div className="lg:col-span-1 bg-gray-900 border border-gray-800 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Sector Allocation</h3>
                {sectorData.map((s, i) => (
                  <div key={s.sector} className="mb-3">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-gray-400 truncate max-w-[160px]">{s.sector}</span>
                      <span className="text-gray-500">{s.pct}%</span>
                    </div>
                    <div className="h-1.5 bg-gray-800 rounded-full">
                      <div
                        className="h-1.5 rounded-full"
                        style={{ width: `${s.pct}%`, backgroundColor: SECTOR_COLORS[i % SECTOR_COLORS.length] }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* Account Breakdown */}
              <div className="lg:col-span-2 bg-gray-900 border border-gray-800 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">By Account</h3>
                <div className="space-y-3">
                  {accounts.filter(a => a !== "all").map(acct => {
                    const acctPositions = positions.filter(p => p.account_name === acct);
                    const acctValue = acctPositions.reduce((s, p) => s + (p.current_value || 0), 0);
                    const acctGL = acctPositions.reduce((s, p) => s + (p.total_gl_dollar || 0), 0);
                    const acctPct = totalValue > 0 ? (acctValue / totalValue * 100) : 0;
                    return (
                      <div key={acct} className="flex items-center justify-between py-2 border-b border-gray-800 last:border-0">
                        <div>
                          <p className="text-white text-sm font-medium">{acct}</p>
                          <p className="text-gray-600 text-xs">{acctPositions.length} positions · {acctPct.toFixed(1)}% of portfolio</p>
                        </div>
                        <div className="text-right">
                          <p className="text-white font-semibold">{fmtValue(acctValue)}</p>
                          <p className={`text-xs ${acctGL >= 0 ? "text-emerald-400" : "text-red-400"}`}>{fmtMoney(acctGL)}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Account filter tabs */}
            <div className="flex gap-2 mb-4 flex-wrap">
              {accounts.map(a => (
                <button
                  key={a}
                  onClick={() => setAccountFilter(a)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                    accountFilter === a
                      ? "bg-emerald-500 text-white"
                      : "bg-gray-800 text-gray-400 hover:text-white"
                  }`}
                >
                  {a === "all" ? `All (${positions.length})` : `${a} (${positions.filter(p => p.account_name === a).length})`}
                </button>
              ))}
            </div>

            {/* Positions Table */}
            <div className="overflow-x-auto rounded-xl border border-gray-800">
              <table className="w-full text-sm">
                <thead className="bg-gray-900 border-b border-gray-800">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Stock</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Shares</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Avg Cost</th>
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
                    return (
                      <tr key={`${p.account_number}-${p.ticker}`} className="bg-gray-950 hover:bg-gray-900 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {p.analysis?.is_absolute_steal && <span title="Absolute Steal">🔥</span>}
                            {p.analysis?.is_overbought && <span title="Overbought — consider trimming">⚠️</span>}
                            <div>
                              <div onClick={() => router.push(`/stock/${p.ticker}`)} className="font-bold text-white hover:text-emerald-400 cursor-pointer transition-colors">{p.ticker}</div>
                              <div className="text-gray-500 text-xs truncate max-w-[160px]">{p.company_name}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-300">{fmt(p.shares)}</td>
                        <td className="px-4 py-3 text-gray-300">{p.avg_cost ? `$${fmt(p.avg_cost)}` : "—"}</td>
                        <td className="px-4 py-3 text-white font-medium">{p.current_value ? `$${p.current_value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}</td>
                        <td className={`px-4 py-3 font-medium ${glPos ? "text-emerald-400" : "text-red-400"}`}>
                          {p.total_gl_dollar != null ? fmtMoney(p.total_gl_dollar) : "—"}
                        </td>
                        <td className={`px-4 py-3 font-medium ${glPos ? "text-emerald-400" : "text-red-400"}`}>
                          {p.total_gl_pct != null ? `${p.total_gl_pct >= 0 ? "+" : ""}${fmt(p.total_gl_pct)}%` : "—"}
                        </td>
                        <td className="px-4 py-3">
                          {a ? (
                            <span className={`text-xs font-semibold px-2 py-1 rounded-full ${signalColors[a.signal] || signalColors["Neutral"]}`}>
                              {a.signal}
                            </span>
                          ) : <span className="text-gray-600 text-xs">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          {a ? (
                            <div className="flex items-center gap-2">
                              <div className="w-12 h-1.5 bg-gray-800 rounded-full">
                                <div className="h-1.5 rounded-full bg-emerald-500" style={{ width: `${a.oversold_score}%` }} />
                              </div>
                              <span className="text-white text-xs">{a.oversold_score}</span>
                            </div>
                          ) : "—"}
                        </td>
                        <td className={`px-4 py-3 text-xs font-medium ${
                          a?.technicals?.rsi < 30 ? "text-emerald-400" :
                          a?.technicals?.rsi > 70 ? "text-red-400" : "text-gray-300"
                        }`}>
                          {a ? fmt(a.technicals?.rsi) : "—"}
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-xs">{p.account_name}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
