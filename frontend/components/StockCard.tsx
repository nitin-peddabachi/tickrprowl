"use client";

import { useState, useEffect } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { useApi } from "@/lib/api";
import PriceChart from "@/components/PriceChart";
import ScoreHistoryChart from "@/components/ScoreHistoryChart";

interface Props {
  stock: any;
}

/* ─── Signal treatment — typographic, not pill ──────────────────────── */
const signalConfig: Record<string, { color: string; marker: string; label: string }> = {
  "Strong Buy":  { color: "text-[var(--buy)]",         marker: "▲▲", label: "STRONG BUY"  },
  "Buy":         { color: "text-[var(--buy)]",         marker: "▲",  label: "BUY"         },
  "Watch":       { color: "text-[var(--amber)]",       marker: "◇",  label: "WATCH"       },
  "Neutral":     { color: "text-[var(--paper-fade)]",  marker: "—",  label: "NEUTRAL"     },
  "Sell":        { color: "text-[var(--sell)]",        marker: "▼",  label: "SELL"        },
  "Strong Sell": { color: "text-[var(--sell-strong)]", marker: "▼▼", label: "STRONG SELL" },
};

const reasonColor: Record<string, string> = {
  "Strong Buy":  "text-[var(--buy)]",
  "Buy":         "text-[var(--buy)]",
  "Watch":       "text-[var(--amber)]",
  "Sell":        "text-[var(--sell)]",
  "Strong Sell": "text-[var(--sell-strong)]",
  "Neutral":     "text-[var(--paper-fade)]",
};

function num(val: any, decimals = 2) {
  if (val === null || val === undefined) return "N/A";
  return typeof val === "number" ? val.toFixed(decimals) : val;
}

function fmtMarketCap(val: number | null) {
  if (!val) return "N/A";
  if (val >= 1e12) return `$${(val / 1e12).toFixed(2)}T`;
  if (val >= 1e9)  return `$${(val / 1e9).toFixed(2)}B`;
  return `$${(val / 1e6).toFixed(2)}M`;
}

function fmtPct(val: number | null | undefined) {
  if (val === null || val === undefined) return "N/A";
  return `${(val * 100).toFixed(1)}%`;
}

function useCountUp(target: number, duration = 1100) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let frame = 0;
    const totalFrames = Math.round(duration / 16);
    const timer = setInterval(() => {
      frame++;
      const progress = 1 - Math.pow(1 - frame / totalFrames, 3);
      setCount(Math.min(Math.round(target * progress), target));
      if (frame >= totalFrames) clearInterval(timer);
    }, 16);
    return () => clearInterval(timer);
  }, [target, duration]);
  return count;
}

/* ─── Score bar — warm amber gradient, single hue, no rainbow ───────── */
function ScoreBar({ score }: { score: number }) {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setWidth(score), 80);
    return () => clearTimeout(t);
  }, [score]);
  return (
    <div className="relative h-px bg-[var(--ink-hairline)] overflow-visible">
      {/* The bar itself sits on the hairline, ~3px tall, warm gradient */}
      <div
        className="absolute -top-1 left-0 h-2 transition-[width] duration-[1100ms] ease-out"
        style={{
          width: `${width}%`,
          background: "linear-gradient(90deg, var(--sell-strong) 0%, var(--sell) 18%, var(--amber-dim) 42%, var(--amber) 60%, var(--buy) 82%, var(--buy-strong) 100%)",
          backgroundSize: "500px 100%",
        }}
      />
      {/* Tick marks at 30/50/70 thresholds — like a printed gauge */}
      {[30, 50, 70].map((t) => (
        <div
          key={t}
          className="absolute -top-1.5 h-3 w-px bg-[var(--ink-bg)]"
          style={{ left: `${t}%` }}
          title={`Threshold ${t}`}
        />
      ))}
    </div>
  );
}

/* ─── Sub-score bar — refined editorial treatment ───────────────────── */
function SubScoreBar({ label, value, max, tip }: { label: string; value: number; max: number; tip: string }) {
  const [width, setWidth] = useState(0);
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  useEffect(() => {
    const t = setTimeout(() => setWidth(pct), 140);
    return () => clearTimeout(t);
  }, [pct]);
  const tone =
    pct >= 70 ? "text-[var(--buy)]" :
    pct >= 40 ? "text-[var(--amber)]" :
                "text-[var(--paper-fade)]";
  const barTone =
    pct >= 70 ? "bg-[var(--buy)]" :
    pct >= 40 ? "bg-[var(--amber)]" :
                "bg-[var(--paper-vapor)]";
  return (
    <div className="group/sub relative">
      <div className="flex items-baseline justify-between mb-1.5">
        <div className="flex items-center gap-1.5">
          <span className="eyebrow">{label}</span>
          <span className="text-[var(--paper-vapor)] text-[9px] cursor-help select-none leading-none">·</span>
          <div className="pointer-events-none absolute top-full left-0 mt-2 z-50 w-60 bg-[var(--ink-raised)] border border-[var(--ink-hairline)] px-3 py-2.5 text-[11px] text-[var(--paper-dim)] leading-relaxed opacity-0 group-hover/sub:opacity-100 transition-opacity duration-200 shadow-2xl">
            {tip}
          </div>
        </div>
        <span className={`font-mono text-xs font-medium tabular ${tone}`}>
          {value}<span className="text-[var(--paper-vapor)]">/{max}</span>
        </span>
      </div>
      {/* Thin engraved bar — sits on hairline */}
      <div className="relative h-px bg-[var(--ink-hairline)]">
        <div
          className={`absolute -top-px h-[3px] transition-[width] duration-[900ms] ease-out ${barTone}`}
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}

const TOOLTIPS: Record<string, string> = {
  // Technicals
  "RSI (14)":       "Relative Strength Index (14-day). Momentum oscillator on a 0–100 scale. Below 30 = oversold (potential buy signal), above 70 = overbought (potential sell signal).",
  "MACD":           "Moving Average Convergence Divergence. Difference between the 12-day and 26-day EMAs. Positive and above the signal line = bullish momentum.",
  "BB %":           "Bollinger Band %B — where price sits within the upper/lower bands. Below 0.1 = near lower band (oversold), above 0.9 = near upper band (overbought).",
  "Stoch %K":       "Stochastic Oscillator %K. Compares the close price to the recent high-low range. Below 20 = oversold, above 80 = overbought.",
  "Stoch %D":       "3-period moving average of %K. A %K crossover above %D is a bullish signal; crossing below is bearish.",
  "SMA 50":         "50-day Simple Moving Average. Price trading below the SMA 50 suggests a short-term downtrend.",
  "SMA 200":        "200-day Simple Moving Average. Price below the SMA 200 signals a long-term downtrend — a key bear market indicator.",
  "MA Cross":       "Moving average crossover. Golden Cross (SMA 50 > SMA 200) = long-term bullish. Death Cross (SMA 50 < SMA 200) = long-term bearish.",
  "Volume Ratio":   "Today's volume divided by the 20-day average volume. Above 1.5× = elevated interest; above 2× = unusually high activity, may signal a breakout or reversal.",
  "OBV Trend":      "On-Balance Volume trend. Rising OBV means volume is flowing into the stock (accumulation). Falling OBV signals distribution (selling pressure).",
  "RSI Divergence": "Bullish divergence: price makes a lower low but RSI makes a higher low. Signals weakening selling pressure and a potential reversal upward.",
  // Fundamentals
  "P/E Ratio":      "Price-to-Earnings (trailing). Share price divided by the last 12 months of EPS. Below 15 = historically cheap; above 25 = expensive.",
  "Forward P/E":    "Price divided by next 12 months of estimated EPS. Lower than trailing P/E implies analysts expect earnings growth.",
  "PEG Ratio":      "P/E divided by the earnings growth rate. Below 1 = potentially undervalued relative to growth. Above 2 = expensive for the growth on offer.",
  "P/B Ratio":      "Price-to-Book. Share price divided by net book value per share. Below 1 = trading below the liquidation value of assets.",
  "P/S Ratio":      "Price-to-Sales. Market cap divided by annual revenue. Below 2 = generally cheap; high P/S requires strong growth to justify.",
  "ROE":            "Return on Equity. Net income as a % of shareholder equity. Above 15% indicates strong management efficiency.",
  "ROA":            "Return on Assets. Net income as a % of total assets. Above 5% shows the company uses its assets efficiently to generate profit.",
  "Dividend Yield": "Annual dividend per share ÷ share price. Above 3% = meaningful income. Unusually high yields can signal a dividend at risk of being cut.",
  "Beta":           "Sensitivity to market moves. Beta > 1 = more volatile than the market; Beta < 1 = more stable. Negative Beta = moves inversely to the market.",
  "Short Interest": "% of float sold short. Above 10% = elevated bearish sentiment. Above 20% = potential short squeeze if positive news drives a rapid rally.",
  "Debt / Equity":  "Total debt as a % of shareholder equity. High D/E means heavy financial leverage — magnifies gains but also losses and bankruptcy risk.",
  "Revenue Growth": "Year-over-year change in revenue. Confirms the business is expanding even if earnings are temporarily depressed.",
  "Earnings Growth":"Year-over-year change in EPS. Extreme values (shown as N/M) usually indicate one-time charges that distort the comparison.",
  "Profit Margin":  "Net income as a % of revenue. Above 10% = healthy. Declining margins signal cost pressure or pricing power erosion.",
  "Market Cap":     "Total market value of all outstanding shares (Price × Shares). Large cap > $10B, Mid cap $2–10B, Small cap < $2B.",
  "DCF Value":      "Discounted Cash Flow intrinsic value per share. Projects free cash flows 5 years out, discounts at a beta-adjusted rate (CAPM-style), adds a terminal value, then subtracts net debt. Amber = price below fair value.",
  "EV / EBITDA":    "Enterprise Value to EBITDA. Below 8 = potentially cheap. More comparable across companies with different capital structures than P/E.",
  "FCF Yield":      "Free Cash Flow ÷ Market Cap (%). Above 5% = good; above 8% = strong. Higher means more real cash generated per dollar of market value.",
};

function MetricRow({ label, value, color = "text-[var(--paper)]", tooltip }: { label: string; value: React.ReactNode; color?: string; tooltip?: string }) {
  const tip = tooltip ?? TOOLTIPS[label];
  return (
    <div className="flex justify-between items-center py-2 border-b border-[var(--ink-divider)] last:border-0">
      <div className="relative group/tip flex items-center gap-1.5">
        <span className="text-[var(--paper-fade)] text-[11px]">{label}</span>
        {tip && (
          <>
            <span className="text-[var(--paper-vapor)] text-[9px] cursor-help leading-none select-none">·</span>
            <div className="pointer-events-none absolute bottom-full left-0 mb-2 z-50 w-60 bg-[var(--ink-raised)] border border-[var(--ink-hairline)] px-3 py-2.5 text-[11px] text-[var(--paper-dim)] leading-relaxed opacity-0 group-hover/tip:opacity-100 transition-opacity duration-200 shadow-2xl whitespace-normal">
              {tip}
            </div>
          </>
        )}
      </div>
      <span className={`font-mono text-xs font-medium tabular ${color}`}>{value}</span>
    </div>
  );
}

function AnalystConsensus({ rating, count }: { rating: number; count?: number }) {
  const label =
    rating <= 1.5 ? { text: "Strong Buy",    color: "text-[var(--buy-strong)]" } :
    rating <= 2.5 ? { text: "Buy",           color: "text-[var(--buy)]"        } :
    rating <= 3.5 ? { text: "Hold",          color: "text-[var(--amber)]"      } :
    rating <= 4.5 ? { text: "Underperform",  color: "text-[var(--sell)]"       } :
                    { text: "Sell",          color: "text-[var(--sell-strong)]"};
  const pct = ((rating - 1) / 4) * 100;
  return (
    <div className="flex items-center gap-3 flex-1 min-w-0">
      <div className="flex flex-col gap-1.5 min-w-0 flex-1">
        <div className="flex items-center justify-between">
          <span className={`text-xs font-semibold tracking-wide ${label.color}`}>{label.text}</span>
          {count && <span className="font-mono text-[10px] text-[var(--paper-vapor)] tabular">{count} analysts</span>}
        </div>
        <div className="relative h-px bg-[var(--ink-hairline)]">
          <div
            className="absolute -top-1 w-[7px] h-[7px] rotate-45 bg-[var(--paper)]"
            style={{ left: `${pct}%`, transform: `translateX(-50%) rotate(45deg)` }}
          />
        </div>
        <div className="flex justify-between text-[9px] font-mono text-[var(--paper-vapor)] tabular tracking-widest">
          <span>BUY</span><span>HOLD</span><span>SELL</span>
        </div>
      </div>
    </div>
  );
}

type Tab = "technicals" | "fundamentals" | "analysis" | "insider";

export default function StockCard({ stock }: Props) {
  const [watchlistStatus, setWatchlistStatus] = useState<"idle" | "adding" | "added" | "error">("idle");
  const animatedScore = useCountUp(stock.oversold_score);
  const [activeTab, setActiveTab] = useState<Tab>("technicals");
  const api = useApi();

  const addToWatchlist = async () => {
    setWatchlistStatus("adding");
    try {
      await api.post("/api/watchlist/", { ticker: stock.ticker });
      setWatchlistStatus("added");
    } catch (e: any) {
      const msg = e.response?.data?.detail || "";
      setWatchlistStatus(msg.includes("already") ? "added" : "error");
    }
  };

  const revenueData = Object.entries(stock.quarterly_revenue_bn || {})
    .map(([date, val]) => ({ quarter: date, revenue: val }))
    .reverse();

  const sig = signalConfig[stock.signal] || signalConfig["Neutral"];
  const analyst = stock.analyst || {};
  const changePositive = stock.price_change_pct != null && stock.price_change_pct >= 0;

  const tabs: { key: Tab; label: string }[] = [
    { key: "technicals",   label: "Technicals" },
    { key: "fundamentals", label: "Fundamentals" },
    { key: "analysis",     label: "Analysis" },
    { key: "insider",      label: "Insider" },
  ];

  return (
    <article className="relative bg-[var(--ink-surface)] border border-[var(--ink-hairline)]">
      {/* Decorative corner ornaments — hairline brackets in each corner */}
      <span aria-hidden className="absolute top-0 left-0 w-2.5 h-2.5 border-t border-l border-[var(--amber-dim)]" />
      <span aria-hidden className="absolute top-0 right-0 w-2.5 h-2.5 border-t border-r border-[var(--amber-dim)]" />
      <span aria-hidden className="absolute bottom-0 left-0 w-2.5 h-2.5 border-b border-l border-[var(--amber-dim)]" />
      <span aria-hidden className="absolute bottom-0 right-0 w-2.5 h-2.5 border-b border-r border-[var(--amber-dim)]" />

      {/* ── Masthead ─────────────────────────────────────────────────── */}
      <header className="px-8 pt-8 pb-6 border-b border-[var(--ink-hairline)]">
        <div className="eyebrow mb-3 flex items-center gap-2">
          <span>TickrProwl</span>
          <span className="text-[var(--paper-vapor)]">·</span>
          <span>Equity Brief</span>
          <span className="flex-1 h-px bg-[var(--ink-divider)] ml-2" />
          <span className="text-[var(--paper-vapor)] font-mono tabular">{new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
        </div>

        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0 flex-1">
            <h1 className="serif text-[3.5rem] leading-[0.95] font-bold text-[var(--paper)] tracking-tight mb-2">
              {stock.ticker}
            </h1>
            <p className="text-[var(--paper-dim)] text-sm leading-snug max-w-md truncate">
              {stock.company_name}
            </p>
            <div className="mt-3 flex items-center gap-3 text-[10px] uppercase tracking-[0.15em] text-[var(--paper-fade)] font-medium">
              {stock.sector && (
                <span className="font-mono">{stock.sector}</span>
              )}
              <span className="text-[var(--paper-vapor)]">|</span>
              <span className={`font-mono font-semibold tabular ${sig.color}`}>
                <span className="opacity-70 mr-1.5">{sig.marker}</span>{sig.label}
              </span>
            </div>
          </div>

          <div className="text-right shrink-0">
            <div className="font-mono font-light text-4xl text-[var(--paper)] tabular tracking-tight leading-none">
              ${num(stock.current_price)}
            </div>
            {stock.price_change_pct != null && (
              <p className={`mt-2 font-mono text-sm tabular ${changePositive ? "text-[var(--buy)]" : "text-[var(--sell)]"}`}>
                {changePositive ? "+" : ""}{num(stock.price_change_pct)}%
                {stock.price_change != null && (
                  <span className="ml-1.5 text-[var(--paper-vapor)]">({changePositive ? "+" : ""}{num(stock.price_change)})</span>
                )}
              </p>
            )}
            <p className="mt-2 eyebrow text-[var(--paper-vapor)] font-mono normal-case tracking-wide">
              {num(stock.pct_from_52w_high)}% from 52w high
            </p>
            <button
              onClick={addToWatchlist}
              disabled={watchlistStatus === "adding" || watchlistStatus === "added"}
              className={`mt-3 text-[10px] uppercase tracking-[0.18em] px-3 py-1.5 border transition-all ${
                watchlistStatus === "added"
                  ? "border-[var(--buy)] text-[var(--buy)]"
                  : watchlistStatus === "error"
                  ? "border-[var(--sell)] text-[var(--sell)]"
                  : "border-[var(--ink-hairline)] text-[var(--paper-fade)] hover:border-[var(--amber)] hover:text-[var(--amber)]"
              }`}
            >
              {watchlistStatus === "adding" ? "…adding"   :
               watchlistStatus === "added"  ? "✓ Filed"   :
               watchlistStatus === "error"  ? "Error"     : "+ Watchlist"}
            </button>
          </div>
        </div>
      </header>

      <div className="px-8 py-7">
        {/* ── Absolute Steal / Overbought / Earnings Banners ─────────── */}
        {stock.is_absolute_steal && (
          <aside className="mb-6 border border-[var(--amber)] bg-[var(--amber-glow)] px-5 py-4">
            <div className="flex items-baseline gap-3 mb-2.5">
              <span className="serif italic text-[var(--amber)] text-lg font-semibold">Absolute Steal</span>
              <span className="eyebrow text-[var(--amber-dim)]">All conditions met</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {stock.steal_conditions && Object.entries(stock.steal_conditions as Record<string, boolean>).map(([key, passed]) => {
                const labels: Record<string, string> = {
                  rsi_oversold: "RSI < 30", strong_signal: "Score ≥ 70", cheap_valuation: "P/E < 15",
                  growing_revenue: "Revenue+", low_leverage: "Low Debt",
                  dcf_undervalued: "Below DCF", financially_healthy: "Piotroski ≥ 7",
                };
                return (
                  <span key={key} className={`text-[10px] font-mono px-2 py-0.5 border tabular ${passed ? "border-[var(--amber)] text-[var(--amber)]" : "border-[var(--ink-divider)] text-[var(--paper-vapor)]"}`}>
                    {passed ? "✓" : "·"} {labels[key] ?? key}
                  </span>
                );
              })}
            </div>
          </aside>
        )}

        {stock.is_overbought && (
          <aside className="mb-6 border border-[var(--sell)] bg-[rgba(196,106,94,0.06)] px-5 py-4">
            <div className="flex items-baseline gap-3 mb-2.5">
              <span className="serif italic text-[var(--sell)] text-lg font-semibold">Overbought</span>
              <span className="eyebrow text-[var(--sell)]">Consider trimming</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {stock.overbought_conditions && Object.entries(stock.overbought_conditions as Record<string, boolean>).map(([key, passed]) => {
                const labels: Record<string, string> = {
                  rsi_high: "RSI > 70", stoch_overbought: "Stoch > 80", near_upper_band: "Upper BB",
                  far_from_low: "Above Low", high_valuation: "P/E > 35",
                };
                return (
                  <span key={key} className={`text-[10px] font-mono px-2 py-0.5 border tabular ${passed ? "border-[var(--sell)] text-[var(--sell)]" : "border-[var(--ink-divider)] text-[var(--paper-vapor)]"}`}>
                    {passed ? "✓" : "·"} {labels[key] ?? key}
                  </span>
                );
              })}
            </div>
          </aside>
        )}

        {stock.next_earnings_date && (() => {
          const daysUntil = Math.ceil((new Date(stock.next_earnings_date).getTime() - Date.now()) / 86400000);
          if (daysUntil >= 0 && daysUntil <= 14) {
            return (
              <div className="mb-6 flex items-center gap-3 border-l-2 border-[var(--amber)] pl-4 py-1">
                <span className="serif italic text-[var(--amber)] text-sm">Earnings imminent</span>
                <span className="text-[var(--paper-dim)] text-xs">
                  {daysUntil} day{daysUntil !== 1 ? "s" : ""} — {stock.next_earnings_date}
                </span>
              </div>
            );
          }
          return null;
        })()}

        {/* ── The Score (Pitchfork-style) ─────────────────────────────── */}
        <section className="mb-8">
          <div className="flex items-baseline justify-between mb-5">
            <span className="eyebrow">Oversold Score</span>
            <span className="text-[10px] text-[var(--paper-vapor)] font-mono tabular">
              {stock.subscores ? "T 0–40 · V 0–40 · Q 0–20" : "0–100"}
            </span>
          </div>

          {/* The number — massive serif, /100 inline right next to it (Pitchfork treatment) */}
          <div className="flex items-baseline gap-3 mb-5 leading-none">
            <div className="serif font-bold text-[var(--paper)] tabular text-[8rem] leading-[0.85]">
              {animatedScore}
            </div>
            <div className="serif font-light text-[var(--paper-fade)] tabular text-[2rem] leading-[0.85]">
              /100
            </div>
          </div>

          {/* Full-width score gauge — thin engraved bar with threshold ticks */}
          <div className="mb-3">
            <ScoreBar score={stock.oversold_score} />
            <div className="flex justify-between mt-2 text-[9px] font-mono text-[var(--paper-vapor)] tabular tracking-widest">
              <span>0</span>
              <span>30</span>
              <span>50</span>
              <span>70</span>
              <span>100</span>
            </div>
          </div>

          {stock.subscores && (
            <div className="grid grid-cols-3 gap-x-8 gap-y-2 pt-6 mt-3 border-t border-[var(--ink-divider)]">
              <SubScoreBar
                label="Technical"
                value={stock.subscores.technical}
                max={40}
                tip="RSI tiers, Stochastic, Bollinger %B, MACD crossover event, 52w-high distance (valuation-gated), volume, RSI divergence, SMA position."
              />
              <SubScoreBar
                label="Valuation"
                value={stock.subscores.valuation}
                max={40}
                tip="P/E and forward P/E tiers, EV/EBITDA, FCF yield, DCF undervaluation with beta-adjusted discount rate."
              />
              <SubScoreBar
                label="Quality"
                value={stock.subscores.quality}
                max={20}
                tip="Piotroski F-Score, Debt/Equity penalties, revenue growth. Quality must be elevated for a true Strong Buy."
              />
            </div>
          )}
        </section>

        {/* ── Why this signal — pilcrow ornament + drop cap ──────────── */}
        {stock.signal_reasons?.length > 0 && (
          <section className="mb-8 border-t border-[var(--ink-divider)] pt-6">
            <h2 className="pilcrow serif italic text-[var(--paper)] text-lg font-medium mb-4">
              Why {stock.signal}
            </h2>
            <ul className="space-y-2 max-w-2xl">
              {(stock.signal_reasons as string[]).map((reason, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2.5 text-sm text-[var(--paper-dim)] leading-relaxed animate-slide-in"
                  style={{ animationDelay: `${i * 60}ms` }}
                >
                  <span className={`mt-1 shrink-0 text-[11px] ${reasonColor[stock.signal] || "text-[var(--paper-fade)]"}`}>›</span>
                  <span>{reason}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ── Analyst Consensus — refined hairline treatment ─────────── */}
        {analyst.rating != null && (
          <section className="mb-8 border-t border-[var(--ink-divider)] pt-6">
            <div className="eyebrow mb-3">Analyst Consensus</div>
            <div className="flex items-start justify-between gap-8 flex-wrap">
              <div className="flex-1 min-w-[200px]">
                <AnalystConsensus rating={analyst.rating} count={analyst.count} />
              </div>
              {analyst.target_mean && (
                <div className="text-right">
                  <div className="eyebrow mb-1">Price Target</div>
                  <div className="font-mono text-2xl text-[var(--paper)] tabular font-light">
                    ${num(analyst.target_mean)}
                  </div>
                  {analyst.target_mean !== stock.current_price && (
                    <span className={`text-xs font-mono tabular ${analyst.target_mean > stock.current_price ? "text-[var(--buy)]" : "text-[var(--sell)]"}`}>
                      {analyst.target_mean > stock.current_price ? "+" : ""}
                      {((analyst.target_mean - stock.current_price) / stock.current_price * 100).toFixed(1)}%
                    </span>
                  )}
                  {analyst.target_low && analyst.target_high && (
                    <div className="text-[10px] text-[var(--paper-vapor)] font-mono mt-1 tabular">
                      Range ${num(analyst.target_low)}–${num(analyst.target_high)}
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>
        )}

        {/* ── Quick Stats — hairline-bordered, no rounded cards ───────── */}
        <section className="mb-8 border-t border-[var(--ink-divider)] pt-6 grid grid-cols-2 sm:grid-cols-4">
          <div className="px-4 py-3 border-r border-[var(--ink-divider)] last:border-r-0 [&:nth-child(2)]:border-r [&:nth-child(2)]:sm:border-r">
            <div className="eyebrow mb-1.5">Market Cap</div>
            <div className="font-mono text-base text-[var(--paper)] tabular font-light">{fmtMarketCap(stock.market_cap)}</div>
          </div>
          <div className="px-4 py-3 border-r border-[var(--ink-divider)] sm:border-r last:border-r-0">
            <div className="eyebrow mb-1.5">P/E Ratio</div>
            <div className="font-mono text-base text-[var(--paper)] tabular font-light">
              {stock.fundamentals?.pe_ratio != null ? num(stock.fundamentals.pe_ratio) : "N/A"}
            </div>
          </div>
          <div className="px-4 py-3 border-r border-[var(--ink-divider)] last:border-r-0">
            <div className="eyebrow mb-1.5">Beta</div>
            <div className="font-mono text-base text-[var(--paper)] tabular font-light">
              {stock.fundamentals?.beta != null ? num(stock.fundamentals.beta) : "N/A"}
            </div>
          </div>
          <div className="px-4 py-3">
            <div className="eyebrow mb-1.5">52w Range</div>
            {stock.price_52w_low != null && stock.price_52w_high != null && stock.price_52w_high > stock.price_52w_low ? (() => {
              const pct = Math.min(Math.max(
                ((stock.current_price - stock.price_52w_low) / (stock.price_52w_high - stock.price_52w_low)) * 100,
                2), 98);
              return (
                <>
                  <div className="relative h-px bg-[var(--ink-hairline)] mt-2 mb-2">
                    <div
                      className="absolute -top-[3px] w-1.5 h-1.5 rotate-45 bg-[var(--amber)]"
                      style={{ left: `${pct}%`, transform: `translateX(-50%) rotate(45deg)` }}
                    />
                  </div>
                  <div className="flex justify-between text-[9px] font-mono text-[var(--paper-vapor)] tabular">
                    <span>${num(stock.price_52w_low, 0)}</span>
                    <span>${num(stock.price_52w_high, 0)}</span>
                  </div>
                </>
              );
            })() : (
              <div className="font-mono text-base text-[var(--paper)] tabular font-light">N/A</div>
            )}
          </div>
        </section>

        {/* ── Tabs — pure typography, amber underscore for active ────── */}
        <div className="border-t border-b border-[var(--ink-hairline)] mb-6">
          <div className="flex gap-0 -mb-px">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={`relative px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] transition-colors ${
                  activeTab === t.key
                    ? "text-[var(--amber)]"
                    : "text-[var(--paper-fade)] hover:text-[var(--paper-dim)]"
                }`}
              >
                {t.label}
                {activeTab === t.key && (
                  <span className="absolute left-3 right-3 bottom-0 h-px bg-[var(--amber)]" />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* ── Tab: Technicals ───────────────────────────────────────── */}
        {activeTab === "technicals" && (
          <div className="animate-fade-in">
            <div className="grid grid-cols-2 gap-x-10 mb-6">
              <div>
                <MetricRow
                  label="RSI (14)"
                  value={num(stock.technicals.rsi)}
                  color={stock.technicals.rsi < 30 ? "text-[var(--buy)]" : stock.technicals.rsi > 70 ? "text-[var(--sell)]" : "text-[var(--paper)]"}
                />
                <MetricRow
                  label="MACD"
                  value={num(stock.technicals.macd, 4)}
                  color={stock.technicals.macd > stock.technicals.macd_signal ? "text-[var(--buy)]" : "text-[var(--sell)]"}
                />
                <MetricRow label="BB %" value={num(stock.technicals.bb_percent, 3)} />
                <MetricRow
                  label="Stoch %K"
                  value={num(stock.technicals.stoch_k)}
                  color={stock.technicals.stoch_k < 20 ? "text-[var(--buy)]" : stock.technicals.stoch_k > 80 ? "text-[var(--sell)]" : "text-[var(--paper)]"}
                />
                <MetricRow label="Stoch %D" value={num(stock.technicals.stoch_d)} />
              </div>
              <div>
                <MetricRow
                  label="SMA 50"
                  value={stock.technicals.sma_50 ? `$${num(stock.technicals.sma_50)}` : "N/A"}
                  color={stock.technicals.sma_50 && stock.current_price < stock.technicals.sma_50 ? "text-[var(--sell)]" : "text-[var(--paper)]"}
                />
                <MetricRow
                  label="SMA 200"
                  value={stock.technicals.sma_200 ? `$${num(stock.technicals.sma_200)}` : "N/A"}
                  color={stock.technicals.sma_200 && stock.current_price < stock.technicals.sma_200 ? "text-[var(--sell)]" : "text-[var(--paper)]"}
                />
                {stock.technicals.golden_cross != null && (
                  <MetricRow
                    label="MA Cross"
                    value={
                      <span className={`px-1.5 py-0.5 border text-[10px] ${stock.technicals.golden_cross ? "border-[var(--buy)] text-[var(--buy)]" : "border-[var(--sell)] text-[var(--sell)]"}`}>
                        {stock.technicals.golden_cross ? "Golden" : "Death"}
                      </span>
                    }
                  />
                )}
                {stock.technicals.volume_ratio != null && (
                  <MetricRow
                    label="Volume Ratio"
                    value={`${num(stock.technicals.volume_ratio)}×`}
                    color={stock.technicals.volume_ratio > 2 ? "text-[var(--amber)]" : stock.technicals.volume_ratio > 1.5 ? "text-[var(--amber-dim)]" : "text-[var(--paper)]"}
                  />
                )}
                {stock.technicals.obv_trend != null && (
                  <MetricRow
                    label="OBV Trend"
                    value={
                      <span className={`px-1.5 py-0.5 border text-[10px] ${stock.technicals.obv_trend === "rising" ? "border-[var(--buy)] text-[var(--buy)]" : "border-[var(--sell)] text-[var(--sell)]"}`}>
                        {stock.technicals.obv_trend === "rising" ? "↑ Rising" : "↓ Falling"}
                      </span>
                    }
                  />
                )}
                <MetricRow label="52w High" value={`$${num(stock.price_52w_high)}`} />
                <MetricRow label="52w Low"  value={`$${num(stock.price_52w_low)}`} />
                <MetricRow
                  label="RSI Divergence"
                  value={
                    stock.rsi_divergence?.detected
                      ? <span className="px-1.5 py-0.5 border border-[var(--buy)] text-[var(--buy)] text-[10px]">✓ Bullish</span>
                      : <span className="text-[var(--paper-vapor)] text-[10px]">None</span>
                  }
                />
              </div>
            </div>

            {stock.rsi_divergence?.detected && stock.rsi_divergence?.description && (
              <div className="mb-5 border-l-2 border-[var(--buy)] pl-4 py-2 flex items-start gap-2">
                <span className="serif italic text-[var(--buy)] text-sm">Bullish divergence —</span>
                <p className="text-sm text-[var(--paper-dim)]">{stock.rsi_divergence.description}</p>
              </div>
            )}

            <PriceChart ticker={stock.ticker} />
          </div>
        )}

        {/* ── Tab: Fundamentals ─────────────────────────────────────── */}
        {activeTab === "fundamentals" && (
          <div className="animate-fade-in grid grid-cols-2 gap-x-10">
            <div>
              <MetricRow
                label="P/E Ratio"
                value={num(stock.fundamentals.pe_ratio)}
                color={stock.fundamentals.pe_ratio && stock.fundamentals.pe_ratio < 15 ? "text-[var(--buy)]" : "text-[var(--paper)]"}
              />
              <MetricRow
                label="Forward P/E"
                value={num(stock.fundamentals.forward_pe)}
                color={stock.fundamentals.forward_pe && stock.fundamentals.forward_pe < 15 ? "text-[var(--buy)]" : "text-[var(--paper)]"}
              />
              <MetricRow
                label="PEG Ratio"
                value={num(stock.fundamentals.peg_ratio)}
                color={
                  stock.fundamentals.peg_ratio == null ? "text-[var(--paper)]" :
                  stock.fundamentals.peg_ratio < 1 ? "text-[var(--buy)]" :
                  stock.fundamentals.peg_ratio > 2 ? "text-[var(--sell)]" : "text-[var(--paper)]"
                }
              />
              <MetricRow label="P/B Ratio" value={num(stock.fundamentals.pb_ratio)} />
              <MetricRow
                label="P/S Ratio"
                value={num(stock.fundamentals.ps_ratio)}
                color={stock.fundamentals.ps_ratio && stock.fundamentals.ps_ratio < 2 ? "text-[var(--buy)]" : "text-[var(--paper)]"}
              />
              <MetricRow
                label="ROE"
                value={fmtPct(stock.fundamentals.roe)}
                color={stock.fundamentals.roe > 0.15 ? "text-[var(--buy)]" : stock.fundamentals.roe < 0 ? "text-[var(--sell)]" : "text-[var(--paper)]"}
              />
              <MetricRow
                label="ROA"
                value={fmtPct(stock.fundamentals.roa)}
                color={stock.fundamentals.roa > 0.05 ? "text-[var(--buy)]" : stock.fundamentals.roa < 0 ? "text-[var(--sell)]" : "text-[var(--paper)]"}
              />
              <MetricRow
                label="Dividend Yield"
                value={fmtPct(stock.fundamentals.dividend_yield)}
                color={stock.fundamentals.dividend_yield > 0.03 ? "text-[var(--buy)]" : "text-[var(--paper)]"}
              />
              <MetricRow
                label="Beta"
                value={num(stock.fundamentals.beta)}
                color={stock.fundamentals.beta > 1.5 ? "text-[var(--amber)]" : "text-[var(--paper)]"}
              />
              <MetricRow
                label="Short Interest"
                value={stock.fundamentals.short_percent_of_float != null ? `${num(stock.fundamentals.short_percent_of_float)}%` : "N/A"}
                color={
                  stock.fundamentals.short_percent_of_float == null ? "text-[var(--paper)]" :
                  stock.fundamentals.short_percent_of_float > 20 ? "text-[var(--amber)]" :
                  stock.fundamentals.short_percent_of_float > 10 ? "text-[var(--amber-dim)]" : "text-[var(--paper)]"
                }
              />
            </div>
            <div>
              <MetricRow
                label="Debt / Equity"
                value={num(stock.fundamentals.debt_to_equity)}
                color={stock.fundamentals.debt_to_equity > 200 ? "text-[var(--sell)]" : "text-[var(--paper)]"}
              />
              <MetricRow
                label="Revenue Growth"
                value={stock.fundamentals.revenue_growth != null ? `${(stock.fundamentals.revenue_growth * 100).toFixed(1)}%` : "N/A"}
                color={(stock.fundamentals.revenue_growth ?? 0) > 0 ? "text-[var(--buy)]" : "text-[var(--sell)]"}
              />
              <MetricRow
                label="Earnings Growth"
                value={stock.fundamentals.earnings_growth != null ? (Math.abs(stock.fundamentals.earnings_growth * 100) > 1000 ? "N/M" : `${(stock.fundamentals.earnings_growth * 100).toFixed(1)}%`) : "N/A"}
                color={(stock.fundamentals.earnings_growth ?? 0) > 0 ? "text-[var(--buy)]" : "text-[var(--sell)]"}
              />
              <MetricRow
                label="Profit Margin"
                value={stock.fundamentals.profit_margin != null ? `${(stock.fundamentals.profit_margin * 100).toFixed(1)}%` : "N/A"}
                color={(stock.fundamentals.profit_margin ?? 0) > 0.1 ? "text-[var(--buy)]" : "text-[var(--paper)]"}
              />
              <MetricRow label="Market Cap" value={fmtMarketCap(stock.market_cap)} />
              <MetricRow
                label="DCF Value"
                value={stock.fundamentals.dcf_value ? `$${num(stock.fundamentals.dcf_value)}` : "N/A"}
                color={stock.fundamentals.dcf_value && stock.current_price < stock.fundamentals.dcf_value ? "text-[var(--buy)]" : "text-[var(--paper)]"}
              />
              <MetricRow
                label="EV / EBITDA"
                value={num(stock.fundamentals.ev_to_ebitda)}
                color={stock.fundamentals.ev_to_ebitda && stock.fundamentals.ev_to_ebitda < 8 ? "text-[var(--buy)]" : "text-[var(--paper)]"}
              />
              <MetricRow
                label="FCF Yield"
                value={stock.fundamentals.fcf_yield != null ? `${num(stock.fundamentals.fcf_yield)}%` : "N/A"}
                color={stock.fundamentals.fcf_yield > 5 ? "text-[var(--buy)]" : stock.fundamentals.fcf_yield < 0 ? "text-[var(--sell)]" : "text-[var(--paper)]"}
              />
            </div>
          </div>
        )}

        {/* ── Tab: Insider Trading ──────────────────────────────────── */}
        {activeTab === "insider" && (() => {
          const insider = stock.insider_activity || {};
          const transactions: any[] = insider.transactions || [];
          const signal: string = insider.signal || "neutral";
          const buyCount: number = insider.buy_count || 0;
          const sellCount: number = insider.sell_count || 0;
          const netShares: number = insider.net_shares || 0;

          const signalTone =
            signal === "bullish" ? "text-[var(--buy)] border-[var(--buy)]" :
            signal === "bearish" ? "text-[var(--sell)] border-[var(--sell)]" :
                                   "text-[var(--paper-fade)] border-[var(--ink-hairline)]";

          const fmtShares = (n: number) =>
            Math.abs(n) >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` :
            Math.abs(n) >= 1_000     ? `${(n / 1_000).toFixed(1)}K`     : String(n);

          const fmtValue = (v: number) =>
            v >= 1_000_000_000 ? `$${(v / 1_000_000_000).toFixed(1)}B` :
            v >= 1_000_000     ? `$${(v / 1_000_000).toFixed(1)}M`     :
            v >= 1_000         ? `$${(v / 1_000).toFixed(0)}K`         : `$${v}`;

          return (
            <div className="animate-fade-in space-y-5">
              <div className="flex items-center justify-between border-y border-[var(--ink-hairline)] py-4 px-1">
                <div className="flex items-center gap-3">
                  <span className="eyebrow">Insider Signal</span>
                  <span className={`text-xs font-mono uppercase tracking-[0.15em] px-2 py-0.5 border ${signalTone}`}>
                    {signal}
                  </span>
                </div>
                <div className="flex gap-5 text-xs font-mono tabular">
                  <span className="text-[var(--buy)]">{buyCount} buy{buyCount !== 1 ? "s" : ""}</span>
                  <span className="text-[var(--sell)]">{sellCount} sale{sellCount !== 1 ? "s" : ""}</span>
                  {netShares !== 0 && (
                    <span className={netShares > 0 ? "text-[var(--buy)]" : "text-[var(--sell)]"}>
                      net {netShares > 0 ? "+" : ""}{fmtShares(netShares)} sh
                    </span>
                  )}
                </div>
              </div>

              {transactions.length === 0 ? (
                <p className="text-center text-[var(--paper-vapor)] text-xs py-8 italic serif">No insider transactions in the last 6 months</p>
              ) : (
                <div>
                  {transactions.map((t, i) => (
                    <div key={i} className="flex items-center justify-between py-3 border-b border-[var(--ink-divider)] last:border-0 gap-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className={`shrink-0 text-[9px] font-mono font-bold tracking-[0.15em] px-1.5 py-0.5 border ${
                          t.type === "buy" ? "border-[var(--buy)] text-[var(--buy)]" : "border-[var(--sell)] text-[var(--sell)]"
                        }`}>
                          {t.type === "buy" ? "BUY" : t.type === "sell" ? "SELL" : "—"}
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm text-[var(--paper)] truncate">{t.insider || "Unknown"}</p>
                          {t.position && <p className="text-[10px] text-[var(--paper-fade)] truncate uppercase tracking-wide">{t.position}</p>}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        {t.shares != null && (
                          <p className="text-xs font-mono text-[var(--paper-dim)] tabular">{fmtShares(t.shares)} sh</p>
                        )}
                        <div className="flex items-center gap-2 justify-end mt-0.5">
                          {t.value != null && (
                            <p className="text-[10px] font-mono text-[var(--paper-fade)] tabular">{fmtValue(t.value)}</p>
                          )}
                          {t.date && <p className="text-[10px] text-[var(--paper-vapor)] font-mono tabular">{t.date}</p>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-[10px] text-[var(--paper-vapor)] text-center italic serif">Source — SEC filings via Yahoo Finance · Last 6 months</p>
            </div>
          );
        })()}

        {/* ── Tab: Analysis ─────────────────────────────────────────── */}
        {activeTab === "analysis" && (
          <div className="animate-fade-in space-y-7">
            {stock.piotroski?.score != null && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <span className="eyebrow" title="9-point financial health score by Joseph Piotroski. 7–9 = financially strong, 4–6 = moderate, 0–3 = weak (potential value trap).">Piotroski F-Score</span>
                  <span className={`font-mono text-sm tabular px-2.5 py-0.5 border ${
                    stock.piotroski.score >= 7 ? "border-[var(--buy)] text-[var(--buy)]" :
                    stock.piotroski.score <= 2 ? "border-[var(--sell)] text-[var(--sell)]" :
                    "border-[var(--amber)] text-[var(--amber)]"
                  }`}>
                    {stock.piotroski.score}/9 · {stock.piotroski.interpretation}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(stock.piotroski.components as Record<string, boolean | null>).map(([key, passed]) => {
                    const labels: Record<string, string> = {
                      roa_positive: "ROA > 0", cfo_positive: "CFO > 0", roa_increasing: "ROA ↑",
                      accruals: "Cash Earnings", leverage_decreasing: "Debt ↓", liquidity_increasing: "Liquidity ↑",
                      no_dilution: "No Dilution", gross_margin_increasing: "Margin ↑", asset_turnover_increasing: "Turnover ↑",
                    };
                    const tips: Record<string, string> = {
                      roa_positive:             "Return on Assets is positive — the company is profitable on an asset basis.",
                      cfo_positive:             "Cash Flow from Operations is positive — real cash earnings support reported income.",
                      roa_increasing:           "Return on Assets improved year-over-year — underlying profitability is strengthening.",
                      accruals:                 "Operating cash flow exceeds net income — earnings are backed by real cash, not accounting accruals.",
                      leverage_decreasing:      "Long-term debt as a fraction of assets decreased — the balance sheet is getting healthier.",
                      liquidity_increasing:     "Current ratio improved — the company is better positioned to cover short-term obligations.",
                      no_dilution:              "No new shares were issued — existing shareholders aren't being diluted.",
                      gross_margin_increasing:  "Gross profit margin increased — the core business is becoming more profitable per unit sold.",
                      asset_turnover_increasing:"Asset turnover ratio improved — the company generates more revenue per dollar of assets.",
                    };
                    if (passed === null) return null;
                    return (
                      <span key={key} title={tips[key]} className={`text-[10px] font-mono px-2 py-0.5 border tabular cursor-help ${passed ? "border-[var(--buy)] text-[var(--buy)]" : "border-[var(--ink-divider)] text-[var(--paper-vapor)]"}`}>
                        {passed ? "✓" : "·"} {labels[key] ?? key}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            <ScoreHistoryChart ticker={stock.ticker} minPoints={7} />

            {revenueData.length > 0 && (
              <div>
                <p className="eyebrow mb-3">Quarterly Revenue (Bn)</p>
                <ResponsiveContainer width="100%" height={120}>
                  <BarChart data={revenueData} barSize={24}>
                    <XAxis dataKey="quarter" tick={{ fill: "var(--paper-vapor)", fontSize: 10, fontFamily: "var(--font-mono)" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: "var(--paper-vapor)", fontSize: 10, fontFamily: "var(--font-mono)" }} axisLine={false} tickLine={false} width={32} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "var(--ink-raised)", border: "1px solid var(--ink-hairline)", borderRadius: "0", fontSize: 12, fontFamily: "var(--font-mono)" }}
                      labelStyle={{ color: "var(--paper-fade)" }}
                      formatter={(val: any) => [`$${val}B`, "Revenue"]}
                      cursor={{ fill: "rgba(212,165,116,0.05)" }}
                    />
                    <Bar dataKey="revenue" fill="var(--amber)" radius={[0, 0, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Footer colophon — small typographic flourish ──────────────── */}
      <footer className="px-8 py-3 border-t border-[var(--ink-hairline)] flex items-center justify-between">
        <span className="text-[9px] uppercase tracking-[0.25em] text-[var(--paper-vapor)] font-mono">
          {stock.ticker} · {sig.label}
        </span>
        <span className="serif italic text-[10px] text-[var(--paper-vapor)]">
          tickrprowl
        </span>
      </footer>
    </article>
  );
}
