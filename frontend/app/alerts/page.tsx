"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import StockModal from "@/components/StockModal";

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

  const fetchAll = async () => {
    const [alertsRes, notifRes] = await Promise.all([
      axios.get("http://localhost:8000/api/alerts/"),
      axios.get("http://localhost:8000/api/alerts/notifications"),
    ]);
    setAlerts(alertsRes.data);
    setNotifications(notifRes.data);
  };

  useEffect(() => { fetchAll(); }, []);

  const createAlert = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticker || !threshold) return;
    setCreating(true);
    setError("");
    setSuccess("");
    try {
      await axios.post("http://localhost:8000/api/alerts/", {
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
    await axios.patch(`http://localhost:8000/api/alerts/${id}/toggle`);
    fetchAll();
  };

  const deleteAlert = async (id: number) => {
    await axios.delete(`http://localhost:8000/api/alerts/${id}`);
    fetchAll();
  };

  const checkNow = async () => {
    setChecking(true);
    await axios.post("http://localhost:8000/api/alerts/check-now");
    await fetchAll();
    setChecking(false);
    setSuccess("Alert check complete!");
    setTimeout(() => setSuccess(""), 3000);
  };

  const markAllRead = async () => {
    await axios.post("http://localhost:8000/api/alerts/notifications/mark-read");
    fetchAll();
  };

  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const unreadCount = notifications.filter((n) => !n.is_read).length;
  const selectedType = ALERT_TYPES.find((t) => t.value === alertType);

  return (
    <main className="min-h-screen bg-gray-950 text-white p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-emerald-400 mb-1">Alerts</h1>
          <p className="text-gray-400">Get notified when stocks hit your conditions</p>
        </div>

        {/* Create Alert */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-8">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Create Alert</h2>
          <form onSubmit={createAlert} className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Ticker</label>
                <input
                  value={ticker}
                  onChange={(e) => setTicker(e.target.value)}
                  placeholder="e.g. AAPL"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white placeholder-gray-600 focus:outline-none focus:border-emerald-500 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Condition</label>
                <select
                  value={alertType}
                  onChange={(e) => setAlertType(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-emerald-500 text-sm"
                >
                  {ALERT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Threshold</label>
                <input
                  type="number"
                  value={threshold}
                  onChange={(e) => setThreshold(e.target.value)}
                  placeholder={selectedType?.placeholder}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white placeholder-gray-600 focus:outline-none focus:border-emerald-500 text-sm"
                />
              </div>
            </div>
            {selectedType && (
              <p className="text-xs text-gray-600">{selectedType.hint}</p>
            )}
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={creating || !ticker || !threshold}
                className="bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-900 text-white font-semibold px-5 py-2 rounded-lg text-sm transition-colors"
              >
                {creating ? "Creating..." : "Create Alert"}
              </button>
              {success && <p className="text-emerald-400 text-sm">{success}</p>}
              {error && <p className="text-red-400 text-sm">{error}</p>}
            </div>
          </form>
        </div>

        {/* Active Alerts */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
              Active Alerts ({alerts.length})
            </h2>
            <button
              onClick={checkNow}
              disabled={checking}
              className="text-xs text-gray-400 hover:text-emerald-400 border border-gray-700 hover:border-emerald-600 px-3 py-1.5 rounded-lg transition-colors"
            >
              {checking ? "Checking..." : "Check Now"}
            </button>
          </div>

          {alerts.length === 0 ? (
            <p className="text-gray-600 text-sm">No alerts set. Create one above.</p>
          ) : (
            <div className="space-y-2">
              {alerts.map((alert) => (
                <div
                  key={alert.id}
                  className={`flex items-center justify-between bg-gray-900 border rounded-xl px-5 py-4 ${
                    alert.is_active ? "border-gray-800" : "border-gray-900 opacity-50"
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-2 h-2 rounded-full ${alert.is_active ? "bg-emerald-500" : "bg-gray-600"}`} />
                    <div>
                      <span onClick={() => setSelectedTicker(alert.ticker)} className="font-bold text-white hover:text-emerald-400 cursor-pointer transition-colors">{alert.ticker}</span>
                      <span className="text-gray-400 text-sm ml-2">
                        {TYPE_LABELS[alert.alert_type]} {alert.threshold}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-gray-600">
                    {alert.last_triggered && (
                      <span>Last triggered: {alert.last_triggered.slice(0, 10)}</span>
                    )}
                    <button
                      onClick={() => toggleAlert(alert.id)}
                      className="text-gray-400 hover:text-yellow-400 transition-colors"
                    >
                      {alert.is_active ? "Pause" : "Resume"}
                    </button>
                    <button
                      onClick={() => deleteAlert(alert.id)}
                      className="text-gray-600 hover:text-red-400 transition-colors"
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
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
              Notifications {unreadCount > 0 && <span className="ml-2 bg-emerald-500 text-white text-xs px-2 py-0.5 rounded-full">{unreadCount} new</span>}
            </h2>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="text-xs text-gray-500 hover:text-white transition-colors"
              >
                Mark all read
              </button>
            )}
          </div>

          {notifications.length === 0 ? (
            <p className="text-gray-600 text-sm">No notifications yet. Alerts check every 30 minutes.</p>
          ) : (
            <div className="space-y-2">
              {notifications.map((n) => (
                <div
                  key={n.id}
                  className={`flex items-start gap-4 rounded-xl px-5 py-4 border ${
                    n.is_read
                      ? "bg-gray-900 border-gray-800 opacity-60"
                      : "bg-emerald-500/5 border-emerald-500/20"
                  }`}
                >
                  <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${n.is_read ? "bg-gray-700" : "bg-emerald-500"}`} />
                  <div className="flex-1">
                    <p className="text-white text-sm">
                      <span onClick={() => setSelectedTicker(n.ticker)} className="font-bold hover:text-emerald-400 cursor-pointer transition-colors">{n.ticker}</span>
                      {n.message.replace(n.ticker, "")}
                    </p>
                    <p className="text-gray-600 text-xs mt-1">{n.triggered_at?.slice(0, 16).replace("T", " ")}</p>
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
