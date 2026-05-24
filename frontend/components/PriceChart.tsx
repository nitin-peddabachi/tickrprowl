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
}

const PERIODS = [
  { label: "1M", value: "1mo" },
  { label: "3M", value: "3mo" },
  { label: "6M", value: "6mo" },
  { label: "1Y", value: "1y" },
  { label: "2Y", value: "2y" },
];

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  return (
    <div className="bg-[var(--ink-raised)] border border-[var(--ink-hairline)] rounded-none p-3 text-xs space-y-1">
      <p className="text-[var(--paper-fade)] mb-1">{label}</p>
      <p className="text-[var(--paper)]">Close: <span className="font-semibold">${d?.close}</span></p>
      <p className="text-[var(--paper-fade)]">Open: ${d?.open} · High: ${d?.high} · Low: ${d?.low}</p>
      {d?.bb_upper && (
        <p className="text-purple-400">BB: ${d?.bb_lower} – ${d?.bb_upper}</p>
      )}
      {d?.rsi != null && (
        <p className={d?.rsi < 30 ? "text-[var(--buy)]" : d?.rsi > 70 ? "text-[var(--sell)]" : "text-[var(--paper-fade)]"}>
          RSI: {d?.rsi}
        </p>
      )}
    </div>
  );
};

export default function PriceChart({ ticker }: Props) {
  const [data, setData] = useState<any[]>([]);
  const [period, setPeriod] = useState("6mo");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    publicApi
      .get(`/api/stocks/${ticker}/history?period=${period}`)
      .then((res) => setData(res.data))
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, [ticker, period]);

  const prices = data.map((d) => d.close).filter(Boolean);
  const minPrice = prices.length > 0 ? Math.min(...prices) * 0.98 : 0;
  const maxPrice = prices.length > 0 ? Math.max(...prices) * 1.02 : 100;

  const rsiData = data.filter((d) => d.rsi !== null);
  const firstClose = data[0]?.close;
  const lastClose = data[data.length - 1]?.close;
  const priceChange = firstClose ? ((lastClose - firstClose) / firstClose) * 100 : 0;
  const isPositive = priceChange >= 0;

  // Use CSS variable values for chart strokes — passed as strings Recharts can use
  const buyColor = "var(--buy)";
  const sellColor = "var(--sell)";
  const priceLineColor = isPositive ? buyColor : sellColor;

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-[var(--paper-fade)] uppercase tracking-wider">Price History</h3>
          {data.length > 0 && (
            <span className={`text-xs font-medium mt-0.5 ${isPositive ? "text-[var(--buy)]" : "text-[var(--sell)]"}`}>
              {isPositive ? "+" : ""}{priceChange.toFixed(2)}% this period
            </span>
          )}
        </div>
        <div className="flex gap-1">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              className={`px-3 py-1 rounded-none text-xs font-medium transition-colors ${
                period === p.value
                  ? "bg-[var(--amber)] text-[var(--ink-bg)]"
                  : "text-[var(--paper-fade)] hover:text-[var(--paper)]"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48 text-[var(--paper-vapor)]">
          <div className="w-5 h-5 border-2 border-[var(--amber)] border-t-transparent rounded-full animate-spin mr-2" />
          Loading chart...
        </div>
      ) : data.length > 0 ? (
        <>
          {/* Price + Bollinger Bands */}
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis
                dataKey="date"
                tick={{ fill: "#6b7280", fontSize: 10 }}
                tickFormatter={(v) => v.slice(5)}
                interval={Math.max(1, Math.floor(data.length / 6))}
              />
              <YAxis
                domain={[minPrice, maxPrice]}
                tick={{ fill: "#6b7280", fontSize: 10 }}
                tickFormatter={(v) => `$${v.toFixed(0)}`}
                width={55}
              />
              <Tooltip content={<CustomTooltip />} />

              {/* Bollinger Band fill */}
              <Area
                dataKey="bb_upper"
                stroke="transparent"
                fill="#7c3aed"
                fillOpacity={0.08}
                dot={false}
                activeDot={false}
                legendType="none"
              />
              <Area
                dataKey="bb_lower"
                stroke="transparent"
                fill="#7c3aed"
                fillOpacity={0}
                dot={false}
                activeDot={false}
                legendType="none"
              />

              {/* BB lines */}
              <Line dataKey="bb_upper" stroke="#7c3aed" strokeWidth={1} dot={false} strokeDasharray="4 2" activeDot={false} />
              <Line dataKey="bb_lower" stroke="#7c3aed" strokeWidth={1} dot={false} strokeDasharray="4 2" activeDot={false} />
              <Line dataKey="bb_mid" stroke="#4b5563" strokeWidth={1} dot={false} activeDot={false} />

              {/* Price line */}
              <Line
                dataKey="close"
                stroke={priceLineColor}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: priceLineColor }}
              />
            </ComposedChart>
          </ResponsiveContainer>

          {/* RSI Chart */}
          <div className="mt-2">
            <p className="text-xs text-[var(--paper-vapor)] mb-1">RSI (14)</p>
            <ResponsiveContainer width="100%" height={80}>
              <ComposedChart data={data} margin={{ top: 0, right: 4, left: 0, bottom: 0 }}>
                <XAxis dataKey="date" hide />
                <YAxis domain={[0, 100]} tick={{ fill: "#6b7280", fontSize: 9 }} width={55} ticks={[30, 50, 70]} />
                <Tooltip content={<CustomTooltip />} />
                <ReferenceLine y={70} stroke="var(--sell)" strokeDasharray="3 3" strokeWidth={1} />
                <ReferenceLine y={30} stroke="var(--buy)" strokeDasharray="3 3" strokeWidth={1} />
                <Line dataKey="rsi" stroke="#f59e0b" strokeWidth={1.5} dot={false} activeDot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </>
      ) : (
        <p className="text-[var(--paper-vapor)] text-sm text-center py-10">No chart data available</p>
      )}
    </div>
  );
}
