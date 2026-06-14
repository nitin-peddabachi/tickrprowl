"use client";

import { useEffect, useState } from "react";
import StockModal from "@/components/StockModal";
import { useApi } from "@/lib/api";

const ALERT_TYPES = [
  { value: "rsi_below", label: "RSI drops below", placeholder: "e.g. 30", hint: "Triggers when RSI ≤ threshold" },
  { value: "price_below", label: "Price drops below ($)", placeholder: "e.g. 150", hint: "Triggers when price ≤ threshold" },
  { value: "score_above", label: "Oversold score above", placeholder: "e.g. 60", hint: "Triggers when score ≥ threshold" },
];

const TYPE_LABELS: Record<string, string> = {
  rsi_below: "RSI Below",
  price_below: "Price Below",
  score_above: "Score Above",
};

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [ticker, setTicker] = useState("");
  const [alertType, setAlertType] = useState("rsi_below");
  const [threshold, setThreshold] = useState("");
  const [creating, setCreating] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const api = useApi();

  const fetchAll = async () => {
    const [alertsRes, notifRes] = await Promise.all([
      api.get("/api/alerts/"),
      api.get("/api/alerts/notifications"),
    ]);
    setAlerts(alertsRes.data);
    setNotifications(notifRes.data);
  };

  useEffect(() => {
    const init = async () => {
      await fetchAll();
      // Auto-mark as read now that the user is viewing the page
      try {
        await api.post("/api/alerts/notifications/mark-read");
        setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      } catch {}
    };
    init();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const createAlert = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticker || !threshold) return;
    const thresholdNum = parseFloat(threshold);
    if (alertType === "rsi_below" && (thresholdNum <= 0 || thresholdNum > 100)) {
      setError("RSI threshold must be between 1 and 100");
      return;
    }
    if (alertType === "score_above" && (thresholdNum <= 0 || thresholdNum > 100)) {
      setError("Score threshold must be between 1 and 100");
      return;
    }
    if (alertType === "price_below" && thresholdNum <= 0) {
      setError("Price threshold must be a positive number");
      return;
    }
    setCreating(true);
    setError("");
    setSuccess("");
    try {
      await api.post("/api/alerts/", {
        ticker: ticker.toUpperCase(),
        alert_type: alertType,
        threshold: parseFloat(threshold),
      });
      setSuccess(`Alert created for ${ticker.toUpperCase()}`);
      setTicker("");
      setThreshold("");
      fetchAll();
    } catch (e: any) {
      setError(e.response?.data?.detail || "Failed to create alert");
    } finally {
      setCreating(false);
    }
  };

  const toggleAlert = async (id: number) => {
    await api.patch(`/api/alerts/${id}/toggle`);
    fetchAll();
  };

  const deleteAlert = async (id: number) => {
    await api.delete(`/api/alerts/${id}`);
    fetchAll();
  };

  const checkNow = async () => {
    setChecking(true);
    await api.post("/api/alerts/check-now");
    await fetchAll();
    setChecking(false);
    setSuccess("Alert check complete!");
    setTimeout(() => setSuccess(""), 3000);
  };

  const markAllRead = async () => {
    await api.post("/api/alerts/notifications/mark-read");
    fetchAll();
  };

  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const unreadCount = notifications.filter((n) => !n.is_read).length;
  const selectedType = ALERT_TYPES.find((t) => t.value === alertType);

  return (
    <main className="min-h-screen bg-transparent text-[var(--paper)] p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="serif font-bold text-[var(--paper)] text-4xl tracking-tight mb-1">Alerts</h1>
          <p className="text-[var(--paper-fade)]">Get notified when stocks hit your conditions</p>
        </div>

        {/* Create Alert */}
        <div className="bg-[var(--ink-surface)] border border-[var(--ink-hairline)] rounded-none p-6 mb-8">
          <h2 className="text-sm font-semibold text-[var(--paper-fade)] uppercase tracking-wider mb-4">Create Alert</h2>
          <form onSubmit={createAlert} className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="text-xs text-[var(--paper-fade)] mb-1 block">Ticker</label>
                <input
                  value={ticker}
                  onChange={(e) => setTicker(e.target.value.toUpperCase())}
                  placeholder="e.g. AAPL"
                  maxLength={10}
                  className="w-full bg-[var(--ink-raised)] border border-[var(--ink-hairline)] rounded-none px-3 py-2.5 text-[var(--paper)] placeholder-[var(--paper-vapor)] focus:outline-none focus:border-[var(--amber)] text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-[var(--paper-fade)] mb-1 block">Condition</label>
                <select
                  value={alertType}
                  onChange={(e) => setAlertType(e.target.value)}
                  className="w-full bg-[var(--ink-raised)] border border-[var(--ink-hairline)] rounded-none px-3 py-2.5 text-[var(--paper)] focus:outline-none focus:border-[var(--amber)] text-sm"
                >
                  {ALERT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-[var(--paper-fade)] mb-1 block">Threshold</label>
                <input
                  type="number"
                  value={threshold}
                  onChange={(e) => setThreshold(e.target.value)}
                  placeholder={selectedType?.placeholder}
                  className="w-full bg-[var(--ink-raised)] border border-[var(--ink-hairline)] rounded-none px-3 py-2.5 text-[var(--paper)] placeholder-[var(--paper-vapor)] focus:outline-none focus:border-[var(--amber)] text-sm"
                />
              </div>
            </div>
            {selectedType && (
              <p className="text-xs text-[var(--paper-vapor)]">{selectedType.hint}</p>
            )}
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={creating || !ticker || !threshold}
                className="bg-[var(--amber)] hover:opacity-90 disabled:opacity-40 text-[var(--ink-bg)] font-semibold px-5 py-2 rounded-none text-sm transition-opacity"
              >
                {creating ? "Creating..." : "Create Alert"}
              </button>
              {success && <p className="text-[var(--buy)] text-sm">{success}</p>}
              {error && <p className="text-[var(--sell)] text-sm">{error}</p>}
            </div>
          </form>
        </div>

        {/* Active Alerts */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-[var(--paper-fade)] uppercase tracking-wider">
              Active Alerts ({alerts.length})
            </h2>
            <button
              onClick={checkNow}
              disabled={checking}
              className="text-xs text-[var(--paper-fade)] hover:text-[var(--amber)] border border-[var(--ink-hairline)] hover:border-[var(--amber)] px-3 py-1.5 rounded-none transition-colors"
            >
              {checking ? "Checking..." : "Check Now"}
            </button>
          </div>

          {alerts.length === 0 ? (
            <p className="text-[var(--paper-vapor)] text-sm">No alerts set. Create one above.</p>
          ) : (
            <div className="space-y-2">
              {alerts.map((alert) => (
                <div
                  key={alert.id}
                  className={`flex items-center justify-between bg-[var(--ink-surface)] border rounded-none px-5 py-4 ${
                    alert.is_active ? "border-[var(--ink-hairline)]" : "border-[var(--ink-divider)] opacity-50"
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-2 h-2 rounded-full ${alert.is_active ? "bg-[var(--amber)]" : "bg-[var(--paper-vapor)]"}`} />
                    <div>
                      <span onClick={() => setSelectedTicker(alert.ticker)} className="font-bold text-[var(--paper)] hover:text-[var(--amber)] cursor-pointer transition-colors">{alert.ticker}</span>
                      <span className="text-[var(--paper-fade)] text-sm ml-2">
                        {TYPE_LABELS[alert.alert_type]} {alert.threshold}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-[var(--paper-vapor)]">
                    {alert.last_triggered && (
                      <span>Last triggered: {alert.last_triggered.slice(0, 10)}</span>
                    )}
                    <button
                      onClick={() => toggleAlert(alert.id)}
                      className="text-[var(--paper-fade)] hover:text-[var(--warn)] transition-colors"
                    >
                      {alert.is_active ? "Pause" : "Resume"}
                    </button>
                    <button
                      onClick={() => deleteAlert(alert.id)}
                      className="text-[var(--paper-vapor)] hover:text-[var(--sell)] transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Notifications */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-[var(--paper-fade)] uppercase tracking-wider">
              Notifications {unreadCount > 0 && <span className="ml-2 bg-[var(--amber)] text-[var(--ink-bg)] text-xs px-2 py-0.5 rounded-none">{unreadCount} new</span>}
            </h2>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="text-xs text-[var(--paper-vapor)] hover:text-[var(--paper)] transition-colors"
              >
                Mark all read
              </button>
            )}
          </div>

          {notifications.length === 0 ? (
            <p className="text-[var(--paper-vapor)] text-sm">No notifications yet. Alerts check automatically in the background.</p>
          ) : (
            <div className="space-y-2">
              {notifications.map((n) => (
                <div
                  key={n.id}
                  className={`flex items-start gap-4 rounded-none px-5 py-4 border ${
                    n.is_read
                      ? "bg-[var(--ink-surface)] border-[var(--ink-hairline)] opacity-60"
                      : "bg-[var(--amber-glow)] border-[var(--amber)]/20"
                  }`}
                >
                  <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${n.is_read ? "bg-[var(--ink-divider)]" : "bg-[var(--amber)]"}`} />
                  <div className="flex-1">
                    <p className="text-[var(--paper)] text-sm">
                      <span onClick={() => setSelectedTicker(n.ticker)} className="font-bold hover:text-[var(--amber)] cursor-pointer transition-colors">{n.ticker}</span>
                      {(n.message ?? "").replace(n.ticker, "")}
                    </p>
                    <p className="text-[var(--paper-vapor)] text-xs mt-1">{n.triggered_at?.slice(0, 16).replace("T", " ")}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <StockModal ticker={selectedTicker} onClose={() => setSelectedTicker(null)} />
    </main>
  );
}
