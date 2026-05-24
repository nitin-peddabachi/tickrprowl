"use client";

import { useState, useEffect, useRef } from "react";
import { publicApi } from "@/lib/api";

interface Props {
  onSearch: (ticker: string) => void;
  loading: boolean;
}

interface Suggestion {
  ticker: string;
  name: string;
  exchange: string;
  type: string;
}

export default function SearchBar({ onSearch, loading }: Props) {
  const [input, setInput] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (input.trim().length < 2) {
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await publicApi.get(`/api/stocks/search?q=${encodeURIComponent(input)}`);
        setSuggestions(res.data);
        setShowDropdown(res.data.length > 0);
        setActiveIndex(-1);
      } catch {
        setSuggestions([]);
      }
    }, 300);
  }, [input]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const selectSuggestion = (ticker: string) => {
    setInput("");
    setSuggestions([]);
    setShowDropdown(false);
    setActiveIndex(-1);
    onSearch(ticker);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (activeIndex >= 0 && suggestions[activeIndex]) {
      selectSuggestion(suggestions[activeIndex].ticker);
    } else if (input.trim()) {
      selectSuggestion(input.trim().toUpperCase());
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showDropdown) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, -1));
    } else if (e.key === "Escape") {
      setShowDropdown(false);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <form onSubmit={handleSubmit} className="flex gap-0 border border-[var(--ink-hairline)] bg-[var(--ink-raised)] focus-within:border-[var(--amber)] transition-colors">
        {/* Input — no rounded corners, hairline border integrated with form */}
        <div className="flex-1 relative">
          <span aria-hidden className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--paper-vapor)] font-mono text-[10px] uppercase tracking-[0.25em] select-none pointer-events-none">
            {input ? "" : "Q ·"}
          </span>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => suggestions.length > 0 && setShowDropdown(true)}
            placeholder="Company name or ticker — e.g. Apple, AAPL"
            className="w-full bg-transparent px-4 py-4 pl-12 text-[var(--paper)] placeholder-[var(--paper-vapor)] focus:outline-none font-mono text-sm tabular tracking-tight"
            autoComplete="off"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="relative bg-[var(--amber)] text-[var(--ink-bg)] font-mono text-[11px] uppercase tracking-[0.22em] font-bold px-8 py-4 transition-all hover:bg-[var(--paper)] disabled:opacity-50 disabled:cursor-not-allowed border-l border-[var(--ink-hairline)]"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 bg-[var(--ink-bg)] animate-ember" />
              Analyzing
            </span>
          ) : (
            <>Analyze →</>
          )}
        </button>
      </form>

      {/* Dropdown — hairline-bordered, no rounded corners */}
      {showDropdown && suggestions.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-[var(--ink-raised)] border border-[var(--ink-hairline)] shadow-2xl">
          {suggestions.map((s, i) => (
            <button
              key={s.ticker}
              type="button"
              onMouseDown={() => selectSuggestion(s.ticker)}
              className={`w-full flex items-center justify-between px-4 py-3 text-left transition-colors ${
                i === activeIndex
                  ? "bg-[var(--amber-glow)] text-[var(--amber)]"
                  : "hover:bg-[rgba(212,165,116,0.05)]"
              } ${i > 0 ? "border-t border-[var(--ink-divider)]" : ""}`}
            >
              <div className="flex items-baseline gap-4 min-w-0">
                <span className={`font-mono font-bold text-sm tabular tracking-tight w-16 shrink-0 ${i === activeIndex ? "text-[var(--amber)]" : "text-[var(--paper)]"}`}>
                  {s.ticker}
                </span>
                <span className="text-[var(--paper-dim)] text-sm truncate">{s.name}</span>
              </div>
              <span className="text-[9px] font-mono uppercase tracking-[0.2em] text-[var(--paper-vapor)] ml-3 flex-shrink-0">
                {s.exchange}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
