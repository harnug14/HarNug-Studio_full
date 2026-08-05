"use client";

import { useEffect, useState } from "react";

type ApiKey = {
  id: string;
  provider: "youtube" | "gemini" | "groq";
  key_label: string;
  api_key: string;
  status: "active" | "limited" | "error" | "unknown";
  last_checked_at: string | null;
};

export default function ApiKeysModal({ onClose }: { onClose: () => void }) {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);

  const [provider, setProvider] = useState<"youtube" | "gemini" | "groq">("gemini");
  const [keyLabel, setKeyLabel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  async function fetchKeys() {
    setLoading(true);
    try {
      const res = await fetch("/api/keys");
      const json = await res.json();
      if (json.data) setKeys(json.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchKeys();
  }, []);

  async function handleAddKey(e: React.FormEvent) {
    e.preventDefault();
    if (!keyLabel.trim() || !apiKey.trim()) return;
    setSubmitting(true);
    setMessage("");

    try {
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
        setMessage("success:API Key berhasil disimpan!");
        fetchKeys();
      }
    } catch (err: any) {
      setMessage("error:" + err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Yakin hapus API key ini?")) return;
    await fetch(`/api/keys?id=${id}`, { method: "DELETE" });
    fetchKeys();
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.6)",
        backdropFilter: "blur(4px)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="glass-card-static animate-fade-in"
        style={{
          width: "100%",
          maxWidth: 520,
          maxHeight: "90vh",
          overflowY: "auto",
          padding: 24,
          background: "var(--bg-secondary)",
          border: "1px solid var(--border-subtle)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
              🔑 API Keys
            </h3>
            <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "4px 0 0 0" }}>
              Kelola kunci API untuk Gemini AI & YouTube Data API
            </p>
          </div>
          <button onClick={onClose} className="btn btn-ghost btn-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Add Key Form */}
        <form onSubmit={handleAddKey} style={{ marginBottom: 24, padding: 16, borderRadius: "var(--radius-md)", background: "var(--bg-tertiary)", border: "1px solid var(--border-subtle)" }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: "var(--text-primary)" }}>
            Tambah Key Baru
          </div>
          
          <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 12, marginBottom: 12 }}>
            <div>
              <label className="form-label">Provider</label>
              <select value={provider} onChange={(e: any) => setProvider(e.target.value)} className="select-field">
                <option value="gemini">Gemini API</option>
                <option value="youtube">YouTube API</option>
                <option value="groq">Groq API</option>
              </select>
            </div>
            <div>
              <label className="form-label">Label Reference</label>
              <input
                type="text"
                placeholder="Contoh: Key Main Gemini"
                value={keyLabel}
                onChange={(e) => setKeyLabel(e.target.value)}
                required
                className="input-field"
              />
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label className="form-label">Secret API Key</label>
            <input
              type="password"
              placeholder="Paste API Key di sini..."
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              required
              className="input-field"
            />
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button type="button" onClick={onClose} className="btn btn-ghost btn-sm">
              Cancel
            </button>
            <button type="submit" disabled={submitting} className="btn btn-primary btn-sm">
              {submitting ? <><span className="spinner" /> Saving...</> : "Save Key"}
            </button>
          </div>

          {message && (
            <div
              style={{
                marginTop: 10,
                fontSize: 12,
                color: message.startsWith("error:") ? "var(--status-error)" : "var(--status-success)",
              }}
            >
              {message.replace(/^(error:|success:)/, "")}
            </div>
          )}
        </form>

        {/* Existing Keys List */}
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: "var(--text-primary)" }}>
          Key Tersimpan ({keys.length})
        </div>

        {loading ? (
          <div className="skeleton" style={{ height: 60 }} />
        ) : keys.length === 0 ? (
          <div style={{ fontSize: 12, color: "var(--text-tertiary)", textAlign: "center", padding: 16 }}>
            Belum ada API Key tersimpan.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {keys.map((k) => (
              <div
                key={k.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "10px 12px",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--border-subtle)",
                  background: "var(--bg-tertiary)",
                }}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: 8 }}>
                    <span>{k.key_label}</span>
                    <span className="badge badge-neutral" style={{ textTransform: "uppercase", fontSize: 10 }}>{k.provider}</span>
                    <span className={`badge ${k.status === "active" ? "badge-success" : k.status === "limited" ? "badge-warning" : "badge-neutral"}`} style={{ fontSize: 10 }}>
                      {k.status}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 2, fontFamily: "monospace" }}>
                    {k.api_key.slice(0, 6)}••••••••{k.api_key.slice(-4)}
                  </div>
                </div>

                <button onClick={() => handleDelete(k.id)} className="btn btn-danger btn-sm" title="Hapus Key">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
