"use client";

import { useEffect, useState } from "react";

type ChannelData = {
  title: string;
  thumbnail: string;
  subscriberCount: string;
  viewCount: string;
  videoCount: string;
  topVideos: Array<{
    id: string;
    title: string;
    thumbnail: string;
    viewCount: number;
  }>;
};

type SavedItem = {
  id: string;
  title: string;
  excerpt: string;
};

export default function DashboardPage() {
  const [topicCount, setTopicCount] = useState(0);
  const [scriptCount, setScriptCount] = useState(0);
  const [visualCount, setVisualCount] = useState(0);

  const [topicsList, setTopicsList] = useState<SavedItem[]>([]);
  const [scriptsList, setScriptsList] = useState<SavedItem[]>([]);
  const [visualsList, setVisualsList] = useState<SavedItem[]>([]);

  // Index untuk pergantian item
  const [itemIndex, setItemIndex] = useState(0);
  // State untuk pause pergantian otomatis saat kursor berada di atas card
  const [isHovered, setIsHovered] = useState(false);

  const [channelInput, setChannelInput] = useState("");
  const [channelData, setChannelData] = useState<ChannelData | null>(null);
  const [loadingChannel, setLoadingChannel] = useState(false);
  const [loadingCounts, setLoadingCounts] = useState(true);
  const [channelError, setChannelError] = useState("");

  const [isEditingChannel, setIsEditingChannel] = useState(false);

  // Helper untuk membersihkan imbuhan berlebih seperti "Visual Package - Naskah - ", "Topik - ", dll.
  function cleanTitle(text: string) {
    if (!text) return "";
    return text
      .replace(/^visual\s*package\s*[-:]\s*/i, "")
      .replace(/^(naskah|visual|topik)\s*[-:]\s*/i, "")
      .replace(/^naskah\s*[-:]\s*/i, "")
      .trim();
  }

  // Timer jeda 3.5 detik (Otomatis pause jika kursor sedang di atas card)
  useEffect(() => {
    if (isHovered) return;
    const timer = setInterval(() => {
      setItemIndex((prev) => prev + 1);
    }, 3500);
    return () => clearInterval(timer);
  }, [isHovered]);

  async function fetchCounts() {
    setLoadingCounts(true);
    try {
      const [topikRes, naskahRes, visualRes] = await Promise.all([
        fetch("/api/topik").then((r) => r.json()),
        fetch("/api/naskah").then((r) => r.json()),
        fetch("/api/visual").then((r) => r.json()),
      ]);

      const rawTopics = topikRes.data || [];
      const rawScripts = naskahRes.data || [];
      const rawVisuals = visualRes.data || [];

      setTopicCount(rawTopics.length);
      setScriptCount(rawScripts.length);
      setVisualCount(rawVisuals.length);

      setTopicsList(
        rawTopics.map((t: any) => ({
          id: t.id || String(Math.random()),
          title: cleanTitle(t.judul || t.title || t.topik || "Topik Tersimpan"),
          excerpt: t.catatan || t.deskripsi || "Catatan topik tersimpan.",
        }))
      );
      setScriptsList(
        rawScripts.map((s: any) => ({
          id: s.id || String(Math.random()),
          title: cleanTitle(s.judul || s.title || "Naskah Tersimpan"),
          excerpt: s.isi_naskah || s.isi || "Isi naskah tersimpan.",
        }))
      );
      setVisualsList(
        rawVisuals.map((v: any) => ({
          id: v.id || String(Math.random()),
          title: cleanTitle(v.judul || v.title || v.nama || "Visual Tersimpan"),
          excerpt: v.prompt || v.deskripsi || "Visual prompt tersimpan.",
        }))
      );
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingCounts(false);
    }
  }

  async function loadChannelProfile(query: string) {
    if (!query.trim()) return;
    setLoadingChannel(true);
    setChannelError("");
    try {
      const res = await fetch(`/api/referensi?channelLookup=${encodeURIComponent(query.trim())}`);
      const json = await res.json();
      if (json.channel) {
        setChannelData(json.channel);
        localStorage.setItem("dashboard_channel_id", query.trim());
        setIsEditingChannel(false);
      } else {
        setChannelData(null);
        setChannelError("Channel YouTube tidak ditemukan. Periksa kembali Channel ID atau @handle.");
        setIsEditingChannel(true);
      }
    } catch (err: any) {
      setChannelError("Gagal memuat data channel YouTube.");
      setIsEditingChannel(true);
    } finally {
      setLoadingChannel(false);
    }
  }

  useEffect(() => {
    fetchCounts();
    const saved = localStorage.getItem("dashboard_channel_id");
    if (saved) {
      setChannelInput(saved);
      loadChannelProfile(saved);
    } else {
      setChannelData(null);
      setChannelInput("");
      setIsEditingChannel(true);
    }
  }, []);

  function handleSearchChannel(e: React.FormEvent) {
    e.preventDefault();
    if (channelInput.trim()) {
      loadChannelProfile(channelInput.trim());
    }
  }

  function handleDisconnectChannel() {
    setChannelData(null);
    setChannelInput("");
    localStorage.removeItem("dashboard_channel_id");
    setIsEditingChannel(true);
  }

  function formatNumber(numStr: string | number): string {
    const val = typeof numStr === "string" ? parseInt(numStr, 10) : numStr;
    if (isNaN(val)) return "0";
    if (val >= 1_000_000) return (val / 1_000_000).toFixed(1) + "M";
    if (val >= 1_000) return (val / 1_000).toFixed(1) + "K";
    return val.toLocaleString("id-ID");
  }

  // Filter & Urutkan murni video terpopuler berdasarkan View Count tertinggi (Top 5)
  const mostPopularVideos = channelData?.topVideos && channelData.topVideos.length > 0
    ? [...channelData.topVideos]
        .sort((a, b) => (Number(b.viewCount) || 0) - (Number(a.viewCount) || 0))
        .slice(0, 5)
    : [];

  const displayVideos = mostPopularVideos.length > 0
    ? mostPopularVideos.length < 4
      ? [...mostPopularVideos, ...mostPopularVideos, ...mostPopularVideos, ...mostPopularVideos]
      : [...mostPopularVideos, ...mostPopularVideos]
    : [];

  // Item aktif yang sedang ditampilkan
  const activeTopic = topicsList.length > 0 ? topicsList[itemIndex % topicsList.length] : null;
  const activeScript = scriptsList.length > 0 ? scriptsList[itemIndex % scriptsList.length] : null;
  const activeVisual = visualsList.length > 0 ? visualsList[itemIndex % visualsList.length] : null;

  return (
    <div>
      <style>{`
        @keyframes fadeInSlide {
          0% { opacity: 0; }
          100% { opacity: 1; }
        }

        @keyframes infiniteMarquee {
          0% { transform: translate3d(0, 0, 0); }
          100% { transform: translate3d(-50%, 0, 0); }
        }

        /* Pure Opacity Fade (Tanpa transform agar teks 100% Tajam tanpa Blur) */
        @keyframes pureFadeIn {
          0% { opacity: 0; }
          100% { opacity: 1; }
        }

        .dashboard-container {
          animation: fadeInSlide 0.25s ease-out forwards;
        }

        .marquee-wrapper {
          overflow: hidden;
          width: 100%;
          position: relative;
          border-radius: var(--radius-md);
        }

        .marquee-track {
          display: flex;
          gap: 14px;
          width: max-content;
          animation: infiniteMarquee 22s linear infinite;
        }

        .marquee-track:hover {
          animation-play-state: paused;
        }

        .video-card-item {
          width: 250px;
          flex-shrink: 0;
          background: var(--bg-tertiary);
          border-radius: var(--radius-md);
          overflow: hidden;
          border: 1px solid var(--border-subtle);
          display: flex;
          flex-direction: column;
          transition: border-color 0.2s ease;
        }

        .video-card-item:hover {
          border-color: var(--border-medium);
        }

        /* Container Preview Teks dengan Custom Scrollbar & Crisp Font Rendering */
        .preview-box-scrollable {
          margin-top: 12px;
          padding-top: 10px;
          border-top: 1px solid var(--border-subtle);
          max-height: 110px;
          overflow-y: auto;
          padding-right: 4px;
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
          text-rendering: optimizeLegibility;
        }

        .preview-box-scrollable::-webkit-scrollbar {
          width: 4px;
        }
        .preview-box-scrollable::-webkit-scrollbar-thumb {
          background: var(--border-medium);
          border-radius: 4px;
        }
        .preview-box-scrollable::-webkit-scrollbar-track {
          background: transparent;
        }

        .sharp-fade-item {
          animation: pureFadeIn 0.25s ease-out forwards;
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
        }

        .dashboard-stats-grid {
          display: grid;
          grid-template-columns: repeat(1, 1fr);
          gap: 16px;
        }
        @media (min-width: 640px) {
          .dashboard-stats-grid {
            grid-template-columns: repeat(3, 1fr);
          }
        }
        .channel-header-wrapper {
          display: flex;
          flex-direction: column;
          gap: 12px;
          margin-bottom: 16px;
        }
        @media (min-width: 640px) {
          .channel-header-wrapper {
            flex-direction: row;
            justify-content: space-between;
            align-items: center;
          }
        }
      `}</style>

      <div className="dashboard-container">
        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">
            Ringkasan profil channel YouTube & statistik aset tersimpan.
          </p>
        </div>

        {/* SECTION 1: Profil Channel YouTube */}
        <div className="glass-card-static" style={{ padding: 22, marginBottom: 24 }}>
          <div className="channel-header-wrapper">
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 600, margin: "0 0 2px 0", color: "var(--text-primary)" }}>
                Profil Channel YouTube
              </h3>
              <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: 0 }}>
                {channelData && !isEditingChannel
                  ? "Channel terhubung ke HarNug Studio"
                  : "Masukkan Channel ID (contoh: UCxxx) atau @handle YouTube untuk memuat profil."}
              </p>
            </div>

            {/* Action Button: Disconnect / Change Channel */}
            {channelData && !isEditingChannel && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  onClick={() => setIsEditingChannel(true)}
                  className="btn btn-secondary btn-sm"
                >
                  Ganti Channel
                </button>
                <button
                  onClick={handleDisconnectChannel}
                  className="btn btn-danger btn-sm"
                >
                  Keluar Channel
                </button>
              </div>
            )}
          </div>

          {/* Form Input */}
          {(isEditingChannel || !channelData) && !loadingChannel && (
            <form onSubmit={handleSearchChannel} style={{ display: "flex", gap: 10, maxWidth: 520, marginBottom: 20, flexWrap: "wrap" }}>
              <input
                type="text"
                placeholder="Channel ID (UC...) atau @handle YouTube..."
                value={channelInput}
                onChange={(e) => setChannelInput(e.target.value)}
                className="input-field"
                style={{ flex: 1, minWidth: 220 }}
                required
              />
              <button type="submit" disabled={loadingChannel} className="btn btn-primary btn-sm">
                {loadingChannel ? <><span className="spinner" /> Hubungkan...</> : "Hubungkan"}
              </button>
              {channelData && (
                <button
                  type="button"
                  onClick={() => setIsEditingChannel(false)}
                  className="btn btn-ghost btn-sm"
                >
                  Batal
                </button>
              )}
            </form>
          )}

          {/* Error message */}
          {channelError && (
            <div style={{ fontSize: 12, color: "var(--status-error)", background: "rgba(248, 113, 113, 0.1)", padding: 12, borderRadius: "var(--radius-md)", marginBottom: 16 }}>
              {channelError}
            </div>
          )}

          {/* Loading skeleton */}
          {loadingChannel ? (
            <div className="skeleton" style={{ height: 130 }} />
          ) : channelData ? (
            <div>
              {/* Channel Info Banner */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                  padding: 16,
                  background: "var(--bg-tertiary)",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--border-subtle)",
                  marginBottom: 20,
                }}
              >
                {channelData.thumbnail ? (
                  <img
                    src={channelData.thumbnail}
                    alt={channelData.title}
                    referrerPolicy="no-referrer"
                    crossOrigin="anonymous"
                    style={{ width: 56, height: 56, borderRadius: "50%", objectFit: "cover", border: "1px solid var(--border-medium)", flexShrink: 0 }}
                  />
                ) : (
                  <div style={{ width: 56, height: 56, borderRadius: "50%", background: "var(--bg-elevated)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-secondary)", flexShrink: 0 }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                  </div>
                )}

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", margin: "0 0 6px 0" }}>
                    {channelData.title}
                  </div>
                  <div style={{ display: "flex", gap: 10, fontSize: 11, color: "var(--text-secondary)", flexWrap: "wrap" }}>
                    <span className="badge badge-neutral">{formatNumber(channelData.subscriberCount)} Subscribers</span>
                    <span className="badge badge-neutral">{formatNumber(channelData.viewCount)} Views</span>
                    <span className="badge badge-neutral">{formatNumber(channelData.videoCount)} Videos</span>
                  </div>
                </div>
              </div>

              {/* Video Terpopuler (Slider Horizontal) */}
              {displayVideos.length > 0 && (
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginBottom: 12 }}>
                    Video Terpopuler
                  </div>
                  <div className="marquee-wrapper">
                    <div className="marquee-track">
                      {displayVideos.map((vid, idx) => (
                        <a
                          key={`${vid.id}-${idx}`}
                          href={`https://www.youtube.com/watch?v=${vid.id}`}
                          target="_blank"
                          rel="noreferrer"
                          style={{ textDecoration: "none" }}
                        >
                          <div className="video-card-item">
                            {vid.thumbnail && (
                              <div style={{ width: "100%", aspectRatio: "16 / 9", overflow: "hidden", background: "#000" }}>
                                <img
                                  src={vid.thumbnail}
                                  alt={vid.title}
                                  referrerPolicy="no-referrer"
                                  crossOrigin="anonymous"
                                  style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                                />
                              </div>
                            )}
                            <div style={{ padding: 12, display: "flex", flexDirection: "column", justifyContent: "space-between", flex: 1 }}>
                              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)", lineHeight: 1.4, marginBottom: 8, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                                {vid.title}
                              </div>
                              <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                                {formatNumber(vid.viewCount)} views
                              </div>
                            </div>
                          </div>
                        </a>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Empty State yang Bersih */
            <div
              style={{
                padding: "28px 16px",
                textAlign: "center",
                background: "var(--bg-tertiary)",
                borderRadius: "var(--radius-md)",
                border: "1px border-dashed var(--border-subtle)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
              }}
            >
              <div style={{ color: "var(--text-tertiary)" }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z"/>
                  <polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02"/>
                </svg>
              </div>
              <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-secondary)" }}>
                Belum Ada Channel Terhubung
              </div>
              <p style={{ fontSize: 12, color: "var(--text-tertiary)", margin: 0, maxWidth: 360 }}>
                Masukkan ID Channel atau @handle YouTube pada form di atas untuk menghubungkan profil channel Anda.
              </p>
            </div>
          )}
        </div>

        {/* SECTION 2: Stat Cards (Topic, Script, Visual) */}
        <div className="dashboard-stats-grid">
          {/* Card Topic */}
          <div
            className="glass-card-static"
            style={{ padding: 20 }}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)" }}>Topic</span>
              <span style={{ color: "var(--text-tertiary)", display: "flex" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 1 1 7.072 0l-.548.547A3.374 3.374 0 0 0 14 18.469V19a2 2 0 1 1-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/></svg>
              </span>
            </div>
            <div style={{ fontSize: 28, fontWeight: 700, marginTop: 4, color: "var(--text-primary)", letterSpacing: "-0.03em" }}>
              {loadingCounts ? "..." : topicCount}
            </div>

            {/* Preview Area (100% Tajam, Scrollable, Pause saat Hover) */}
            {activeTopic && (
              <div className="preview-box-scrollable">
                <div key={`${activeTopic.id}-${itemIndex}`} className="sharp-fade-item">
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4, lineHeight: 1.3 }}>
                    {activeTopic.title}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-tertiary)", lineHeight: 1.45 }}>
                    {activeTopic.excerpt}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Card Script */}
          <div
            className="glass-card-static"
            style={{ padding: 20 }}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)" }}>Script</span>
              <span style={{ color: "var(--text-tertiary)", display: "flex" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/></svg>
              </span>
            </div>
            <div style={{ fontSize: 28, fontWeight: 700, marginTop: 4, color: "var(--text-primary)", letterSpacing: "-0.03em" }}>
              {loadingCounts ? "..." : scriptCount}
            </div>

            {/* Preview Area (100% Tajam, Scrollable, Pause saat Hover) */}
            {activeScript && (
              <div className="preview-box-scrollable">
                <div key={`${activeScript.id}-${itemIndex}`} className="sharp-fade-item">
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4, lineHeight: 1.3 }}>
                    {activeScript.title}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-tertiary)", lineHeight: 1.45 }}>
                    {activeScript.excerpt}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Card Visual */}
          <div
            className="glass-card-static"
            style={{ padding: 20 }}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)" }}>Visual</span>
              <span style={{ color: "var(--text-tertiary)", display: "flex" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="2" width="20" height="20" rx="2" ry="2"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/></svg>
              </span>
            </div>
            <div style={{ fontSize: 28, fontWeight: 700, marginTop: 4, color: "var(--text-primary)", letterSpacing: "-0.03em" }}>
              {loadingCounts ? "..." : visualCount}
            </div>

            {/* Preview Area (100% Tajam, Scrollable, Pause saat Hover) */}
            {activeVisual && (
              <div className="preview-box-scrollable">
                <div key={`${activeVisual.id}-${itemIndex}`} className="sharp-fade-item">
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4, lineHeight: 1.3 }}>
                    {activeVisual.title}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-tertiary)", lineHeight: 1.45 }}>
                    {activeVisual.excerpt}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}