"use client";

import { useEffect, useState } from "react";
import DashboardLayout from "../../components/DashboardLayout";

type ApiKey = {
  id: string;
  provider: "youtube" | "gemini" | "groq";
  key_label: string;
  api_key: string;
  status: "active" | "limited" | "error" | "unknown";
  last_checked_at: string | null;
};

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);

  const [provider, setProvider] = useState<"youtube" | "gemini" | "groq">("youtube");
  const [keyLabel, setKeyLabel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  async function fetchKeys() {
    setLoading(true);
    const res = await fetch("/api/keys");
    const json = await res.json();
    if (json.data) setKeys(json.data);
    setLoading(false);
  }

  useEffect(() => {
    fetchKeys();
  }, []);

  async function handleAddKey(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setMessage("");

    const res = await fetch("/api/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, key_label: keyLabel, api_key: apiKey }),
    });
    const json = await res.json();

    if (json.error) {
      setMessage("error:" + json.error);
    } else {
      setKeyLabel("");
      setApiKey("");
      setMessage("success:Key berhasil disimpan");
      fetchKeys();
    }
    setSubmitting(false);
  }

  async function handleDelete(id: string) {
    const confirmed = confirm("Yakin mau hapus key ini?");
    if (!confirmed) return;

    await fetch(`/api/keys?id=${id}`, { method: "DELETE" });
    fetchKeys();
  }

  function getStatusStyle(status: string) {
    switch (status) {
      case "active":
        return { dot: "status-dot-success", bg: "rgba(34, 197, 94, 0.1)", text: "var(--status-success)" };
      case "limited":
        return { dot: "status-dot-warning", bg: "rgba(245, 158, 11, 0.1)", text: "var(--status-warning)" };
      case "error":
        return { dot: "status-dot-error", bg: "rgba(239, 68, 68, 0.1)", text: "var(--status-error)" };
      default:
        return { dot: "", bg: "rgba(255, 255, 255, 0.05)", text: "var(--text-secondary)" };
    }
  }

  function statusLabel(status: string) {
    if (status === "active") return "Aktif";
    if (status === "limited") return "Limit kuota habis";
    if (status === "error") return "Error";
    return "Belum diketahui";
  }

  return (
    <DashboardLayout>
      <div className="animate-fade-in">
        <div className="page-header">
          <h1 className="page-title">Manajemen API Key</h1>
          <p className="page-subtitle">
            Kelola kunci API untuk integrasi YouTube (riset) dan Gemini (AI Chat & Analisis).
          </p>
        </div>

        {/* Form Add Key */}
        <div className="glass-card-static" style={{ padding: 24, marginBottom: 32 }}>
          <form onSubmit={handleAddKey}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 16, marginBottom: 16 }}>
              <div>
                <label className="form-label">Provider</label>
                <select
                  value={provider}
                  onChange={(e) => setProvider(e.target.value as "youtube" | "gemini" | "groq")}
                  className="select-field"
                >
                  <option value="youtube">YouTube Data API</option>
                  <option value="gemini">Google Gemini API</option>
                  <option value="groq">Groq API (LPU)</option>
                </select>
              </div>
              <div>
                <label className="form-label">Label Referensi</label>
                <input
                  type="text"
                  placeholder="Misal: Project HarNug"
                  value={keyLabel}
                  onChange={(e) => setKeyLabel(e.target.value)}
                  required
                  className="input-field"
                />
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label className="form-label">API Key rahasia</label>
              <input
                type="password"
                placeholder="Paste API key di sini..."
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                required
                className="input-field"
              />
            </div>

            <button type="submit" disabled={submitting} className="btn btn-primary">
              {submitting ? (
                <><span className="spinner" />Menyimpan...</>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                  Tambah Key
                </>
              )}
            </button>

            {message && (
              <div style={{
                marginTop: 16,
                padding: "10px 14px",
                borderRadius: "var(--radius-md)",
                fontSize: 13,
                background: message.startsWith("error:") ? "rgba(239, 68, 68, 0.1)" : "rgba(34, 197, 94, 0.1)",
                border: `1px solid ${message.startsWith("error:") ? "rgba(239, 68, 68, 0.2)" : "rgba(34, 197, 94, 0.2)"}`,
                color: message.startsWith("error:") ? "#fca5a5" : "#86efac",
              }}>
                {message.replace(/^(error:|success:)/, "")}
              </div>
            )}
          </form>
        </div>

        {/* Info Box */}
        <div style={{
          padding: 16,
          borderRadius: "var(--radius-md)",
          background: "rgba(6, 182, 212, 0.05)",
          border: "1px solid rgba(6, 182, 212, 0.15)",
          marginBottom: 24,
          display: "flex",
          gap: 12,
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent-cyan)" strokeWidth="2" style={{ flexShrink: 0, marginTop: 2 }}>
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
          <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5 }}>
            <strong style={{ color: "var(--text-primary)", display: "block", marginBottom: 4 }}>Informasi Kuota Gemini</strong>
            Status Gemini API terupdate otomatis saat digunakan. Jika satu key habis kuota (merah), sistem akan mencoba key berikutnya. Kuota Gemini di-reset oleh Google setiap hari sekitar pukul 16:00 WIB, dan status akan kembali hijau.
          </div>
        </div>

        <div className="section-title">Daftar Key</div>

        {loading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {[1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 80 }} />)}
          </div>
        ) : keys.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777z" />
              </svg>
            </div>
            <div className="empty-state-text">Belum ada API key tersimpan.</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {keys.map((k) => {
              const statusStyle = getStatusStyle(k.status);

              return (
                <div
                  key={k.id}
                  className="glass-card-static"
                  style={{
                    padding: 16,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 16,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                    <div style={{
                      width: 40,
                      height: 40,
                      borderRadius: "var(--radius-sm)",
                      background: k.provider === "youtube" ? "rgba(239, 68, 68, 0.1)" : k.provider === "groq" ? "rgba(249, 115, 22, 0.1)" : "rgba(168, 85, 247, 0.1)",
                      color: k.provider === "youtube" ? "#ef4444" : k.provider === "groq" ? "#f97316" : "#a855f7",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}>
                      {k.provider === "youtube" ? (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z"/><polygon fill="#050505" points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02"/></svg>
                      ) : k.provider === "groq" ? (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" /></svg>
                      ) : (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>
                      )}
                    </div>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                        <strong style={{ fontSize: 15, color: "var(--text-primary)" }}>{k.key_label}</strong>
                        <span style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          padding: "2px 8px",
                          borderRadius: "var(--radius-full)",
                          fontSize: 11,
                          fontWeight: 500,
                          background: statusStyle.bg,
                          color: statusStyle.text,
                        }}>
                          {k.status !== "unknown" && <span className={`status-dot ${statusStyle.dot}`} style={{ width: 6, height: 6 }} />}
                          {statusLabel(k.status)}
                        </span>
                      </div>
                      <div style={{ fontSize: 13, color: "var(--text-tertiary)" }}>
                        <code style={{ background: "rgba(255,255,255,0.05)", padding: "2px 6px", borderRadius: 4 }}>
                          {k.api_key.slice(0, 6)}••••••••••••{k.api_key.slice(-4)}
                        </code>
                        {k.last_checked_at && (
                          <span style={{ marginLeft: 8 }}>
                            Cek: {new Date(k.last_checked_at).toLocaleString("id-ID")}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <button onClick={() => handleDelete(k.id)} className="btn btn-ghost btn-icon">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}