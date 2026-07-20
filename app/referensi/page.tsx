"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import DashboardLayout from "../components/DashboardLayout";

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
  const router = useRouter();
  const [list, setList] = useState<ReferensiRow[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [channelUrl, setChannelUrl] = useState("");
  const [selectedModel, setSelectedModel] = useState(MODEL_OPTIONS[0].value);
  const [submitting, setSubmitting] = useState(false);
  const [progressText, setProgressText] = useState("");
  const [progressPercent, setProgressPercent] = useState(0);
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
      if (res.ok) setList(data.data || []);
    } catch {
      // keep empty
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
    setProgressPercent(5);

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
        setProgressPercent(0);
        return;
      }

      const { id, totalVideos } = startData;
      await fetchList();

      for (let i = 0; i < totalVideos; i++) {
        setProgressText(`Menganalisis video ${i + 1} dari ${totalVideos}...`);
        setProgressPercent(10 + Math.round(((i + 1) / totalVideos) * 80));

        const videoRes = await fetch(`/api/referensi/${id}/analyze-video`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ videoIndex: i, model: selectedModel }),
        });
        const videoData = await videoRes.json();

        if (!videoRes.ok || !videoData.success) {
          pushNotification(`Video ${i + 1} gagal dianalisis${videoData.error ? `: ${videoData.error}` : ""}`);
        }
      }

      setProgressText("Merangkum kesimpulan channel...");
      setProgressPercent(95);

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
      setProgressPercent(100);
      await fetchList();
    } catch (err: any) {
      setFormError(err.message || "Terjadi kesalahan");
    }

    setSubmitting(false);
    setProgressText("");
    setProgressPercent(0);
  }

  async function handleDelete(id: string) {
    if (!confirm("Hapus data referensi ini?")) return;
    try {
      const res = await fetch(`/api/referensi/${id}`, { method: "DELETE" });
      if (res.ok) {
        setList((prev) => prev.filter((r) => r.id !== id));
        if (expandedId === id) setExpandedId(null);
      }
    } catch {
      // silent
    }
  }

  function handleBuatTopik(id: string) {
    router.push(`/ai-chat?fromReferensi=${id}`);
  }

  function statusBadge(status: string) {
    if (status === "done") return <span className="badge badge-success"><span className="status-dot status-dot-success" />Selesai</span>;
    if (status === "processing") return <span className="badge badge-processing"><span className="status-dot status-dot-processing" />Memproses</span>;
    return <span className="badge badge-error"><span className="status-dot status-dot-error" />Gagal</span>;
  }

  return (
    <DashboardLayout>
      <div className="animate-fade-in">
        <div className="page-header" style={{ marginBottom: 24 }}>
          <h1 className="page-title">Reference</h1>
          <p className="page-subtitle">Analisis channel YouTube untuk riset gaya konten, niche, visual, dan editing.</p>
        </div>

        {/* Toast notifications */}
        {notifications.length > 0 && (
          <div className="toast-container">
            {notifications.map((msg, i) => (
              <div key={i} className="toast toast-error">{msg}</div>
            ))}
          </div>
        )}

        {/* Form */}
        <div className="glass-card-static" style={{ padding: 24, marginBottom: 32 }}>
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 16 }}>
              <label className="form-label">Link channel YouTube</label>
              <input
                type="text"
                value={channelUrl}
                onChange={(e) => setChannelUrl(e.target.value)}
                placeholder="https://www.youtube.com/@namachannel"
                disabled={submitting}
                className="input-field"
              />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label className="form-label">Model Gemini</label>
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                disabled={submitting}
                className="select-field"
              >
                {MODEL_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            {formError && (
              <div style={{
                padding: "10px 14px",
                borderRadius: "var(--radius-md)",
                background: "var(--glass-bg)",
                border: "1px solid var(--status-error)",
                color: "var(--status-error)",
                fontSize: 13,
                marginBottom: 16,
              }}>
                {formError}
              </div>
            )}

            <button type="submit" disabled={submitting} className="btn btn-primary">
              {submitting ? (
                <><span className="spinner" />Memproses...</>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></svg>
                  Analisis Channel
                </>
              )}
            </button>

            {submitting && progressText && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 8 }}>
                  {progressText}
                </div>
                <div className="progress-bar-track">
                  <div className="progress-bar-fill" style={{ width: `${progressPercent}%` }} />
                </div>
              </div>
            )}
          </form>
        </div>

        {/* List */}
        <div className="section-title">Riwayat Analisis</div>

        {loadingList && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {[1, 2].map((i) => (
              <div key={i} className="skeleton" style={{ height: 100 }} />
            ))}
          </div>
        )}

        {!loadingList && list.length === 0 && (
          <div className="empty-state">
            <div className="empty-state-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
              </svg>
            </div>
            <div className="empty-state-text">Belum ada channel yang dianalisis.</div>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {list.map((row) => {
            const isExpanded = expandedId === row.id;
            const analyses = row.video_data?.analyses || [];

            return (
              <div key={row.id} className="glass-card-static" style={{ padding: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6, wordBreak: "break-all" }}>
                      {row.channel_title || row.channel_url}
                    </div>
                    {row.channel_title && (
                      <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 8 }}>
                        {row.channel_url}
                      </div>
                    )}
                    {statusBadge(row.status)}
                  </div>
                  <button onClick={() => handleDelete(row.id)} className="btn btn-danger btn-sm">
                    Hapus
                  </button>
                </div>

                {row.status === "done" && (
                  <>
                    <div style={{
                      marginTop: 16,
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                      gap: 12,
                    }}>
                      {[
                        { label: "Niche", value: row.analysis_niche },
                        { label: "Visual", value: row.analysis_visual },
                        { label: "Editing", value: row.analysis_editing },
                        { label: "Hook & CTA", value: row.analysis_hook_cta },
                      ].map((item) => (
                        <div key={item.label} style={{
                          padding: 12,
                          borderRadius: "var(--radius-md)",
                          background: "var(--glass-bg)",
                          border: "1px solid var(--glass-border)",
                        }}>
                          <div style={{ fontSize: 11, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4, fontWeight: 500 }}>
                            {item.label}
                          </div>
                          <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5 }}>
                            {item.value || "-"}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : row.id)}
                        className="btn btn-ghost btn-sm"
                        style={{ color: "var(--accent-primary)" }}
                      >
                        {isExpanded ? "Sembunyikan detail" : `Lihat detail ${analyses.length} video`}
                      </button>
                      <button
                        onClick={() => handleBuatTopik(row.id)}
                        className="btn btn-secondary btn-sm"
                      >
                        ✨ Buat Ide Topik dari Referensi Ini
                      </button>
                    </div>

                    {isExpanded && (
                      <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 10 }}>
                        {analyses.map((a, i) => (
                          <div key={i} style={{
                            padding: 14,
                            borderRadius: "var(--radius-md)",
                            background: "var(--glass-bg)",
                            border: "1px solid var(--glass-border)",
                          }} className="animate-fade-in">
                            <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 14 }}>
                              {i + 1}. {a.title}
                            </div>
                            {a.error ? (
                              <div style={{ color: "var(--status-error)", fontSize: 13 }}>Gagal: {a.error}</div>
                            ) : (
                              <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6 }}>
                                <div><strong style={{ color: "var(--text-tertiary)" }}>Niche:</strong> {a.niche}</div>
                                <div><strong style={{ color: "var(--text-tertiary)" }}>Visual:</strong> {a.visual}</div>
                                <div><strong style={{ color: "var(--text-tertiary)" }}>Editing:</strong> {a.editing}</div>
                                <div><strong style={{ color: "var(--text-tertiary)" }}>Hook/CTA:</strong> {a.hookCta}</div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}

                {row.status === "processing" && (
                  <div style={{ marginTop: 12 }}>
                    <div className="progress-bar-track">
                      <div className="progress-bar-fill progress-bar-indeterminate" />
                    </div>
                    <div style={{ fontSize: 13, color: "var(--text-tertiary)", marginTop: 8 }}>
                      Analisis sedang berjalan...
                    </div>
                  </div>
                )}

                {row.status === "error" && (
                  <div style={{ marginTop: 12, fontSize: 13, color: "var(--status-error)" }}>
                    Analisis gagal untuk channel ini.
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </DashboardLayout>
  );
}