"use client";

import { useState } from "react";

interface Props {
  onSearch: (ticker: string) => void;
  loading: boolean;
}

export default function SearchBar({ onSearch, loading }: Props) {
  const [input, setInput] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      onSearch(input.trim().toUpperCase());
      setInput("");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-3">
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Enter stock ticker (e.g. AAPL)"
        className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500"
      />
      <button
        type="submit"
        disabled={loading}
        className="bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-800 text-white font-semibold px-6 py-3 rounded-lg transition-colors"
      >
        {loading ? "Analyzing..." : "Analyze"}
      </button>
    </form>
  );
}
