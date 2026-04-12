"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { publicApi } from "@/lib/api";
import StockCard from "@/components/StockCard";

export default function StockPage() {
  const { ticker } = useParams<{ ticker: string }>();
  const router = useRouter();
  const [stock, setStock] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    publicApi
      .get(`/api/stocks/${ticker.toUpperCase()}`)
      .then((res) => setStock(res.data))
      .catch(() => setError(`Could not load data for ${ticker.toUpperCase()}.`))
      .finally(() => setLoading(false));
  }, [ticker]);

  return (
    <main className="min-h-screen bg-gray-950 text-white p-8">
      <div className="max-w-3xl mx-auto">
        <button
          onClick={() => router.back()}
          className="text-gray-500 hover:text-white text-sm mb-6 flex items-center gap-1 transition-colors"
        >
          ← Back
        </button>

        {loading && (
          <div className="flex items-center gap-3 text-gray-400 mt-20 justify-center">
            <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            Loading {ticker.toUpperCase()}...
          </div>
        )}
        {error && <p className="text-red-400">{error}</p>}
        {stock && <StockCard stock={stock} />}
      </div>
    </main>
  );
}
