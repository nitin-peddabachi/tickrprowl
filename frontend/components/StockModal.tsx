"use client";

import { useEffect, useState } from "react";
import { publicApi } from "@/lib/api";
import StockCard from "@/components/StockCard";

interface Props {
  ticker: string | null;
  onClose: () => void;
}

export default function StockModal({ ticker, onClose }: Props) {
  const [stock, setStock] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!ticker) return;
    setStock(null);
    setLoading(true);
    publicApi
      .get(`/api/stocks/${ticker.toUpperCase()}`)
      .then((res) => setStock(res.data))
      .finally(() => setLoading(false));
  }, [ticker]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!ticker) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 backdrop-blur-sm p-6 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl mt-8 mb-8"
        onClick={(e) => e.stopPropagation()}
      >
        {loading && (
          <div className="flex items-center justify-center gap-3 text-[var(--paper-fade)] py-20">
            <div className="w-5 h-5 border-2 border-[var(--amber)] border-t-transparent rounded-full animate-spin" />
            Loading {ticker}...
          </div>
        )}
        {stock && <StockCard stock={stock} />}
      </div>
    </div>
  );
}
