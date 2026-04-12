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

  // Fetch suggestions with debounce
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

  // Close dropdown when clicking outside
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
      <form onSubmit={handleSubmit} className="flex gap-3">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => suggestions.length > 0 && setShowDropdown(true)}
          placeholder="Search by company name or ticker (e.g. Apple, AAPL)"
          className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500"
          autoComplete="off"
        />
        <button
          type="submit"
          disabled={loading}
          className="bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-800 text-white font-semibold px-6 py-3 rounded-lg transition-colors"
        >
          {loading ? "Analyzing..." : "Analyze"}
        </button>
      </form>

      {/* Dropdown */}
      {showDropdown && suggestions.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-16 mt-1 bg-gray-800 border border-gray-700 rounded-lg overflow-hidden shadow-xl">
          {suggestions.map((s, i) => (
            <button
              key={s.ticker}
              type="button"
              onMouseDown={() => selectSuggestion(s.ticker)}
              className={`w-full flex items-center justify-between px-4 py-3 text-left transition-colors ${
                i === activeIndex ? "bg-emerald-500/20" : "hover:bg-gray-700"
              } ${i > 0 ? "border-t border-gray-700" : ""}`}
            >
              <div>
                <span className="font-bold text-white">{s.ticker}</span>
                <span className="text-gray-400 text-sm ml-3">{s.name}</span>
              </div>
              <span className="text-xs text-gray-600 ml-2 flex-shrink-0">{s.exchange}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
