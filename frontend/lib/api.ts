import axios from "axios";
import { useAuth } from "@clerk/nextjs";
import { useMemo } from "react";

export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

/**
 * Unauthenticated axios instance for public endpoints (/api/stocks/*)
 */
export const publicApi = axios.create({ baseURL: API_URL });

/**
 * Hook that returns an axios instance with the Clerk auth token
 * automatically attached to every request. Use this for user-specific
 * endpoints: /api/watchlist, /api/alerts, /api/portfolio.
 */
export function useApi() {
  const { getToken } = useAuth();
  return useMemo(() => {
    const instance = axios.create({ baseURL: API_URL });
    instance.interceptors.request.use(async (config) => {
      const token = await getToken();
      if (token) config.headers.Authorization = `Bearer ${token}`;
      return config;
    });
    return instance;
  }, [getToken]);
}
