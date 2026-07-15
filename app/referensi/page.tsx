"use client";

import { useState, useEffect } from "react";

interface VideoAnalysisItem {
  videoId: string;
  title: string;
  niche?: string;
  visual?: string;
  editing?: string;
  hookCta?: string;
  error?: string;
}

interface ReferensiRow {
  id: string;
  channel_url: string;
  channel_id: string;
  channel_title: string | null;
  status: "processing" | "done" | "error";
  video_data: { videos: any[]; analyses: VideoAnalysisItem[] } | null;
  analysis_niche: string | null;
  analysis_visual: string | null;
  analysis_editing: string | null;
  analysis_hook_cta: string | null;
  created_at: string;
}

const MODEL_OPTIONS = [
  { value: "gemini-3-flash-preview", label: "Gemini 3 Flash Preview (rekomendasi)" },
  { value: "gemini-3.5-flash", label: "Gemini 3.5 Flash" },
  { value: "gemini-3.1-flash-lite", label: "Gemini 3.1 Flash Lite (lebih ringan)" },
  { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash (lama)" },
];

export default function ReferensiPage() {
  const [list, setList] = useState<ReferensiRow[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [channelUrl, setChannelUrl] = useState("");
  const [selectedModel, setSelectedModel] = useState(MODEL_OPTIONS[0].value);
  const [submitting, setSubmitting] = useState(false);
  const [progressText, setProgressText] = useState("");
  const [notifications, setNotifications] = useState<string[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    fetchList();
  }, []);

  async function fetchList() {
    setLoadingList(true);
    try {
      const res = await fetch("/api/referensi");
      const data = await res.json();
      if (res.ok) {
        setList(data.data || []);
      }
    } catch (e) {
      // diamkan, list tetap kosong
    }
    setLoadingList(false);
  }

  function pushNotification(msg: string) {
    setNotifications((prev) => [...prev, msg]);
    setTimeout(() => {
      setNotifications((prev) => prev.slice(1));
    }, 5000);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");

    if (!channelUrl.trim()) {
      setFormError("Link channel wajib diisi");
      return;
    }

    setSubmitting(true);
    setProgressText("Mengambil daftar video channel...");

    try {
      const startRes = await fetch("/api/referensi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelUrl }),
      });
      const startData = await startRes.json();

      if (!startRes.ok) {
        setFormError(startData.error || "Gagal memulai analisis");
        setSubmitting(false);
        setProgressText("");
        return;
      }

      const { id, totalVideos } = startData;

      await fetchList();

      for (let i = 0; i < totalVideos; i++) {
        setProgressText(`Menganalisis video ${i + 1} dari ${totalVideos} (${selectedModel})...`);

        const videoRes = await fetch(`/api/referensi/${id}/analyze-video`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ videoIndex: i, model: selectedModel }),
        });
        const videoData = await videoRes.json();

        if (!videoRes.ok || !videoData.success) {
          pushNotification(
            `Video ${i + 1} gagal dianalisis${
              videoData.error ? `: ${videoData.error}` : ""
            }`
          );
        }
      }

      setProgressText("Merangkum kesimpulan channel...");
      const summaryRes = await fetch(`/api/referensi/${id}/summarize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: selectedModel }),
      });
      const summaryData = await summaryRes.json();

      if (!summaryRes.ok) {
        pushNotification(summaryData.error || "Gagal merangkum kesimpulan channel");
      }

      setChannelUrl("");
      await fetchList();
    } catch (err: any) {
      setFormError(err.message || "Terjadi kesalahan");
    }

    setSubmitting(false);
    setProgressText("");
  }

  async function handleDelete(id: string) {
    if (!confirm("Hapus data referensi ini?")) return;

    try {
      const res = await fetch(`/api/referensi/${id}`, { method: "DELETE" });
      if (res.ok) {
        setList((prev) => prev.filter((r) => r.id !== id));
        if (expandedId === id) setExpandedId(null);
      }
    } catch (e) {
      // diamkan
    }
  }

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: 24 }}>
      <h1 style={{ fontSize: 24, marginBottom: 16 }}>Menu Referensi</h1>

      <div style={{ position: "fixed", top: 16, right: 16, zIndex: 50 }}>
        {notifications.map((msg, i) => (
          <div
            key={i}
            style={{
              background: "#7a1f1f",
              color: "#fff",
              padding: "8px 12px",
              borderRadius: 6,
              marginBottom: 8,
              fontSize: 13,
              maxWidth: 300,
            }}
          >
            {msg}
          </div>
        ))}
      </div>

      <form
        onSubmit={handleSubmit}
        style={{
          border: "1px solid #333",
          borderRadius: 8,
          padding: 16,
          marginBottom: 24,
        }}
      >
        <label style={{ display: "block", marginBottom: 8, fontSize: 14 }}>
          Link channel YouTube
        </label>
        <input
          type="text"
          value={channelUrl}
          onChange={(e) => setChannelUrl(e.target.value)}
          placeholder="https://www.youtube.com/@namachannel"
          disabled={submitting}
          style={{
            width: "100%",
            padding: 8,
            borderRadius: 6,
            border: "1px solid #444",
            background: "#111",
            color: "#fff",
            marginBottom: 12,
          }}
        />

        <label style={{ display: "block", marginBottom: 8, fontSize: 14 }}>
          Model Gemini
        </label>
        <select
          value={selectedModel}
          onChange={(e) => setSelectedModel(e.target.value)}
          disabled={submitting}
          style={{
            width: "100%",
            padding: 8,
            borderRadius: 6,
            border: "1px solid #444",
            background: "#111",
            color: "#fff",
            marginBottom: 12,
          }}
        >
          {MODEL_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        {formError && (
          <div style={{ color: "#f88", fontSize: 13, marginBottom: 12 }}>
            {formError}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          style={{
            padding: "8px 16px",
            borderRadius: 6,
            border: "1px solid #666",
            background: submitting ? "#333" : "#1a1a1a",
            color: "#fff",
            cursor: submitting ? "not-allowed" : "pointer",
          }}
        >
          {submitting ? "Memproses..." : "Analisis Channel"}
        </button>

        {submitting && progressText && (
          <div style={{ marginTop: 12, fontSize: 13, color: "#aaa" }}>
            {progressText}
          </div>
        )}
      </form>

      <h2 style={{ fontSize: 18, marginBottom: 12 }}>Riwayat Analisis</h2>

      {loadingList && <p style={{ color: "#888" }}>Memuat data...</p>}

      {!loadingList && list.length === 0 && (
        <p style={{ color: "#888" }}>Belum ada channel yang dianalisis.</p>
      )}

      {list.map((row) => {
        const isExpanded = expandedId === row.id;
        const analyses = row.video_data?.analyses || [];

        return (
          <div
            key={row.id}
            style={{
              border: "1px solid #333",
              borderRadius: 8,
              padding: 16,
              marginBottom: 12,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <div style={{ fontSize: 15, fontWeight: 600 }}>
                  {row.channel_url}
                </div>
                <div style={{ fontSize: 12, color: "#888" }}>
                  Status:{" "}
                  {row.status === "processing"
                    ? "Sedang diproses"
                    : row.status === "done"
                    ? "Selesai"
                    : "Gagal"}
                </div>
              </div>
              <button
                onClick={() => handleDelete(row.id)}
                style={{
                  background: "none",
                  border: "1px solid #555",
                  borderRadius: 6,
                  color: "#f88",
                  padding: "4px 10px",
                  cursor: "pointer",
                  fontSize: 12,
                }}
              >
                Hapus
              </button>
            </div>

            {row.status === "done" && (
              <>
                <div style={{ marginTop: 12, fontSize: 13, lineHeight: 1.6 }}>
                  <div>
                    <strong>Niche:</strong> {row.analysis_niche}
                  </div>
                  <div>
                    <strong>Visual:</strong> {row.analysis_visual}
                  </div>
                  <div>
                    <strong>Editing:</strong> {row.analysis_editing}
                  </div>
                  <div>
                    <strong>Hook & CTA:</strong> {row.analysis_hook_cta}
                  </div>
                </div>

                <button
                  onClick={() => setExpandedId(isExpanded ? null : row.id)}
                  style={{
                    marginTop: 10,
                    background: "none",
                    border: "none",
                    color: "#6cf",
                    cursor: "pointer",
                    fontSize: 13,
                    padding: 0,
                  }}
                >
                  {isExpanded
                    ? "Sembunyikan detail per video"
                    : `Lihat detail ${analyses.length} video`}
                </button>

                {isExpanded && (
                  <div style={{ marginTop: 12 }}>
                    {analyses.map((a, i) => (
                      <div
                        key={i}
                        style={{
                          borderTop: "1px solid #333",
                          paddingTop: 10,
                          marginTop: 10,
                          fontSize: 12,
                        }}
                      >
                        <div style={{ fontWeight: 600, marginBottom: 4 }}>
                          {i + 1}. {a.title}
                        </div>
                        {a.error ? (
                          <div style={{ color: "#f88" }}>Gagal: {a.error}</div>
                        ) : (
                          <div style={{ color: "#ccc", lineHeight: 1.5 }}>
                            <div>Niche: {a.niche}</div>
                            <div>Visual: {a.visual}</div>
                            <div>Editing: {a.editing}</div>
                            <div>Hook/CTA: {a.hookCta}</div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {row.status === "processing" && (
              <div style={{ marginTop: 8, fontSize: 13, color: "#aaa" }}>
                Analisis sedang berjalan atau tertunda...
              </div>
            )}

            {row.status === "error" && (
              <div style={{ marginTop: 8, fontSize: 13, color: "#f88" }}>
                Analisis gagal untuk channel ini.
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}