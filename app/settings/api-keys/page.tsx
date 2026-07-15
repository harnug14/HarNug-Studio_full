"use client";

import { useEffect, useState } from "react";

type ApiKey = {
  id: string;
  provider: "youtube" | "gemini";
  key_label: string;
  api_key: string;
  status: "active" | "limited" | "error" | "unknown";
  last_checked_at: string | null;
};

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [testingId, setTestingId] = useState<string | null>(null);

  const [provider, setProvider] = useState<"youtube" | "gemini">("youtube");
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
      setMessage("Gagal menyimpan: " + json.error);
    } else {
      setKeyLabel("");
      setApiKey("");
      setMessage("Key berhasil disimpan");
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

  async function handleTest(id: string) {
    setTestingId(id);
    const res = await fetch("/api/keys/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const json = await res.json();
    setTestingId(null);
    fetchKeys();
    if (json.message) {
      alert(json.message);
    }
  }

  function statusIcon(status: string) {
    if (status === "active") return "🟢";
    if (status === "limited") return "🔴";
    if (status === "error") return "⚠️";
    return "⚪";
  }

  return (
    <main style={{ maxWidth: 700, margin: "0 auto", padding: 24 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 16 }}>
        Manajemen API Key
      </h1>

      <form onSubmit={handleAddKey} style={{ marginBottom: 32, display: "flex", flexDirection: "column", gap: 8 }}>
        <select
          value={provider}
          onChange={(e) => setProvider(e.target.value as "youtube" | "gemini")}
          style={{ padding: 8 }}
        >
          <option value="youtube">YouTube</option>
          <option value="gemini">Gemini</option>
        </select>

        <input
          type="text"
          placeholder="Label (contoh: Key 1)"
          value={keyLabel}
          onChange={(e) => setKeyLabel(e.target.value)}
          required
          style={{ padding: 8 }}
        />

        <input
          type="text"
          placeholder="Paste API key di sini"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          required
          style={{ padding: 8 }}
        />

        <button type="submit" disabled={submitting} style={{ padding: 10, cursor: "pointer" }}>
          {submitting ? "Menyimpan..." : "Tambah Key"}
        </button>

        {message && <p>{message}</p>}
      </form>

      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>Daftar Key</h2>

      {loading ? (
        <p>Memuat...</p>
      ) : keys.length === 0 ? (
        <p>Belum ada key tersimpan.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {keys.map((k) => (
            <div
              key={k.id}
              style={{
                border: "1px solid #333",
                borderRadius: 8,
                padding: 12,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <div>
                  {statusIcon(k.status)} <strong>{k.key_label}</strong> ({k.provider})
                </div>
                <div style={{ fontSize: 12, opacity: 0.6 }}>
                  {k.api_key.slice(0, 6)}...{k.api_key.slice(-4)}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => handleTest(k.id)}
                  disabled={testingId === k.id}
                  style={{ padding: "6px 12px", cursor: "pointer" }}
                >
                  {testingId === k.id ? "Testing..." : "Test"}
                </button>
                <button
                  onClick={() => handleDelete(k.id)}
                  style={{ padding: "6px 12px", cursor: "pointer" }}
                >
                  Hapus
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}