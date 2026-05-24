"use client";

import { useEffect, useState } from "react";
import { publicApi } from "@/lib/api";
import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  CartesianGrid,
} from "recharts";

interface Props {
  ticker: string;
  minPoints?: number;
}

const PERIODS = [
  { label: "7D",  days: 7 },
  { label: "30D", days: 30 },
  { label: "90D", days: 90 },
];

// CSS variable hex equivalents for chart rendering
// These must be actual hex/rgb values since Recharts SVG doesn't resolve CSS vars
const SIGNAL_ZONES = [
  { y: 70, label: "Strong Buy", color: "#a3c585" }, // --buy
  { y: 50, label: "Buy",        color: "#84cc16" },
  { y: 30, label: "Watch",      color: "#f59e0b" }, // --warn
];

function scoreColor(score: number) {
  if (score >= 70) return "#a3c585"; // --buy
  if (score >= 50) return "#84cc16";
  if (score >= 30) return "#f59e0b"; // --warn
  return "#6b7280";
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  const color = scoreColor(d?.score ?? 0);
  return (
    <div className="bg-[var(--ink-raised)] border border-[var(--ink-hairline)] rounded-none p-3 text-xs space-y-1 min-w-[140px]">
      <p className="text-[var(--paper-fade)] mb-1">{label}</p>
      <p style={{ color }} className="font-bold">Score: {d?.score}/100</p>
      {d?.signal && <p className="text-[var(--paper-fade)]">Signal: {d.signal}</p>}
      {d?.rsi != null && (
        <p className={d.rsi < 30 ? "text-[var(--buy)]" : d.rsi > 70 ? "text-[var(--sell)]" : "text-[var(--paper-fade)]"}>
          RSI: {d.rsi?.toFixed(1)}
        </p>
      )}
      {d?.price != null && <p className="text-[var(--paper-fade)]">Price: ${d.price?.toFixed(2)}</p>}
    </div>
  );
};

export default function ScoreHistoryChart({ ticker, minPoints = 1 }: Props) {
  const [data, setData]     = useState<any[]>([]);
  const [days, setDays]     = useState(30);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    publicApi
      .get(`/api/stocks/${ticker}/score-history?days=${days}`)
      .then((res) => setData(res.data))
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, [ticker, days]);

  if (!loading && data.length < minPoints) return null;

  const latest = data[data.length - 1];
  const earliest = data[0];
  const scoreDelta = latest && earliest ? latest.score - earliest.score : null;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-xs font-bold text-[var(--paper-fade)] uppercase tracking-widest">Oversold Score History</h3>
          {scoreDelta !== null && data.length > 1 && (
            <span className={`text-xs font-mono mt-0.5 ${scoreDelta > 0 ? "text-[var(--buy)]" : scoreDelta < 0 ? "text-[var(--sell)]" : "text-[var(--paper-vapor)]"}`}>
              {scoreDelta > 0 ? "+" : ""}{scoreDelta} pts this period
            </span>
          )}
        </div>
        <div className="flex gap-1">
          {PERIODS.map((p) => (
            <button
              key={p.days}
              onClick={() => setDays(p.days)}
              className={`px-3 py-1 rounded-none text-xs font-medium transition-colors ${
                days === p.days ? "bg-[var(--amber)] text-[var(--ink-bg)]" : "text-[var(--paper-fade)] hover:text-[var(--paper)]"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-36 text-[var(--paper-vapor)]">
          <div className="w-5 h-5 border-2 border-[var(--amber)] border-t-transparent rounded-full animate-spin mr-2" />
          Loading…
        </div>
      ) : data.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-36 text-center">
          <p className="text-[var(--paper-vapor)] text-xs">No history yet — scores are recorded each time a stock is looked up.</p>
          <p className="text-[var(--paper-vapor)] text-[10px] mt-1">Come back after a few lookups to see the trend.</p>
        </div>
      ) : data.length === 1 ? (
        <div className="flex flex-col items-center justify-center h-36 text-center">
          <p className={`text-3xl font-extrabold font-mono`} style={{ color: scoreColor(data[0].score) }}>{data[0].score}</p>
          <p className="text-[var(--paper-fade)] text-xs mt-1">Only one data point so far — more lookups will build the trend</p>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={160}>
          <ComposedChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
            <XAxis
              dataKey="date"
              tick={{ fill: "#6b7280", fontSize: 10 }}
              tickFormatter={(v) => v.slice(5)}
              interval={Math.max(0, Math.floor(data.length / 5) - 1)}
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fill: "#6b7280", fontSize: 10 }}
              width={28}
              ticks={[0, 30, 50, 70, 100]}
            />
            <Tooltip content={<CustomTooltip />} />

            {/* Signal zone bands */}
            <Area dataKey={() => 30} fill="#f59e0b" fillOpacity={0.04} stroke="none" legendType="none" />
            <Area dataKey={() => 50} fill="#84cc16" fillOpacity={0.04} stroke="none" legendType="none" />
            <Area dataKey={() => 70} fill="#a3c585" fillOpacity={0.04} stroke="none" legendType="none" />

            {/* Reference lines */}
            {SIGNAL_ZONES.map((z) => (
              <ReferenceLine key={z.y} y={z.y} stroke={z.color} strokeDasharray="4 2" strokeWidth={1} strokeOpacity={0.5} />
            ))}

            {/* Score line */}
            <Line
              dataKey="score"
              stroke="#a3c585"
              strokeWidth={2}
              dot={(props: any) => {
                const { cx, cy, payload } = props;
                return (
                  <circle
                    key={`dot-${payload.date}`}
                    cx={cx}
                    cy={cy}
                    r={3}
                    fill={scoreColor(payload.score)}
                    stroke="transparent"
                  />
                );
              }}
              activeDot={{ r: 5 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      )}

      {/* Legend */}
      {data.length > 1 && (
        <div className="flex gap-4 mt-2 justify-end">
          {SIGNAL_ZONES.map((z) => (
            <span key={z.y} className="flex items-center gap-1 text-[10px] text-[var(--paper-vapor)]">
              <span className="w-3 h-0.5 inline-block" style={{ backgroundColor: z.color, opacity: 0.6 }} />
              {z.label} ({z.y})
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
