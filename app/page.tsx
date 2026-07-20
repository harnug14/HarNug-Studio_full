"use client";

import { useEffect, useState } from "react";
import DashboardLayout from "./components/DashboardLayout";

interface Stats {
  referensi: number;
  topik: number;
  naskah: number;
  visual: number;
}

interface YouTubeChannel {
  title: string;
  description: string;
  thumbnail: string;
  bannerUrl?: string;
  country?: string;
  publishedAt?: string;
  subscriberCount: string;
  videoCount: string;
  viewCount: string;
  topVideos?: any[];
  latestVideos?: any[];
}

export default function ProfilePage() {
  const [stats, setStats] = useState<Stats>({ referensi: 0, topik: 0, naskah: 0, visual: 0 });
  const [loadingStats, setLoadingStats] = useState(true);
  const [channelId, setChannelId] = useState("");
  const [channelInput, setChannelInput] = useState("");
  const [channelData, setChannelData] = useState<YouTubeChannel | null>(null);
  const [loadingChannel, setLoadingChannel] = useState(false);
  const [channelError, setChannelError] = useState("");

  // Load saved channel ID from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("harnug_channel_id");
    if (saved) {
      setChannelId(saved);
      setChannelInput(saved);
    }
  }, []);

  // Fetch app stats
  useEffect(() => {
    async function fetchStats() {
      try {
        const [refRes, topikRes, naskahRes, visualRes] = await Promise.all([
          fetch("/api/referensi").then((r) => r.json()),
          fetch("/api/topik").then((r) => r.json()),
          fetch("/api/naskah").then((r) => r.json()),
          fetch("/api/visual").then((r) => r.json()),
        ]);
        setStats({
          referensi: refRes.data?.length || 0,
          topik: topikRes.data?.length || 0,
          naskah: naskahRes.data?.length || 0,
          visual: visualRes.data?.length || 0,
        });
      } catch {
        // keep zeros
      }
      setLoadingStats(false);
    }
    fetchStats();
  }, []);

  // Fetch YouTube channel data
  useEffect(() => {
    if (!channelId) return;
    fetchChannelData(channelId);
  }, [channelId]);

  async function fetchChannelData(id: string) {
    setLoadingChannel(true);
    setChannelError("");
    try {
      // Use YouTube API via our existing keys
      const res = await fetch(`/api/referensi?channelLookup=${encodeURIComponent(id)}`);
      const json = await res.json();
      if (json.channel) {
        setChannelData(json.channel);
      } else {
        setChannelError("Channel tidak ditemukan. Pastikan ID/Handle benar.");
      }
    } catch {
      setChannelError("Gagal mengambil data channel.");
    }
    setLoadingChannel(false);
  }

  function handleSaveChannel(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = channelInput.trim();
    if (!trimmed) return;
    localStorage.setItem("harnug_channel_id", trimmed);
    setChannelId(trimmed);
  }

  function handleDisconnect() {
    localStorage.removeItem("harnug_channel_id");
    setChannelId("");
    setChannelInput("");
    setChannelData(null);
  }

  function formatCount(numStr: string | number): string {
    const n = typeof numStr === 'string' ? parseInt(numStr, 10) : numStr;
    if (isNaN(n)) return "0";
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
    if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
    return n.toLocaleString("id-ID");
  }

  function parseISO8601Duration(duration: string) {
    const match = duration.match(/PT(\d+H)?(\d+M)?(\d+S)?/);
    if (!match) return "0:00";
    const h = (parseInt(match[1]) || 0);
    const m = (parseInt(match[2]) || 0);
    const s = (parseInt(match[3]) || 0);
    if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  const VideoCard = ({ video, badge }: { video: any; badge: string }) => (
    <div style={{
      display: "flex", gap: 16, padding: 16, borderRadius: "var(--radius-md)", 
      background: "rgba(255,255,255,0.02)", border: "1px solid var(--glass-border)", 
      position: "relative"
    }}>
      <div style={{ position: "relative", width: 160, flexShrink: 0, borderRadius: 8, overflow: "hidden", aspectRatio: "16/9", background: "#111" }}>
        <img src={video.thumbnail} alt={video.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        <div style={{ position: "absolute", bottom: 6, right: 6, background: "rgba(0,0,0,0.8)", color: "#fff", fontSize: 11, padding: "2px 6px", borderRadius: 4, fontWeight: 500 }}>
          {parseISO8601Duration(video.duration)}
        </div>
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginBottom: 8, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", lineHeight: 1.4 }}>
          {video.title}
        </div>
        <div style={{ display: "flex", gap: 16, fontSize: 12, color: "var(--text-tertiary)", marginTop: "auto" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            {formatCount(video.viewCount)}
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>
            {formatCount(video.likeCount)}
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            {formatCount(video.commentCount)}
          </span>
        </div>
      </div>
      <div style={{ position: "absolute", top: -8, left: -8, background: "var(--accent-gradient)", color: "#fff", fontSize: 10, fontWeight: 700, padding: "4px 8px", borderRadius: 12, boxShadow: "0 2px 8px rgba(0,0,0,0.5)" }}>
        {badge}
      </div>
    </div>
  );

  const avgViews = channelData && parseInt(channelData.videoCount) > 0 
    ? (parseInt(channelData.viewCount) / parseInt(channelData.videoCount)).toFixed(0) 
    : "0";

  const progressCards = [
    { label: "Reference", value: stats.referensi, color: "#a855f7", icon: "🔍" },
    { label: "Topic", value: stats.topik, color: "#06b6d4", icon: "💡" },
    { label: "Script", value: stats.naskah, color: "#14b8a6", icon: "📝" },
    { label: "Visual", value: stats.visual, color: "#f59e0b", icon: "🎬" },
  ];

  return (
    <DashboardLayout>
      <div className="animate-fade-in">
        {/* Page Header */}
        <div className="page-header">
          <h1 className="page-title">Profile</h1>
          <p className="page-subtitle">
            YouTube channel overview and your content creation progress.
          </p>
        </div>

        {/* YouTube Channel Section */}
        {channelId && channelData ? (
          <>
            {/* Connected Channel Card */}
            <div
              className="glass-card-static"
              style={{
                padding: 0,
                marginBottom: 32,
                overflow: "hidden",
              }}
            >
              {/* Channel Banner */}
              <div style={{
                height: 140,
                background: channelData.bannerUrl ? `url(${channelData.bannerUrl}) center/cover no-repeat` : "linear-gradient(135deg, rgba(168, 85, 247, 0.15), rgba(6, 182, 212, 0.15), rgba(245, 158, 11, 0.1))",
                position: "relative",
              }}>
                <div style={{
                  position: "absolute",
                  bottom: 0, left: 0, right: 0, height: "100%",
                  background: "linear-gradient(to top, rgba(12,12,12,0.95) 0%, rgba(12,12,12,0.4) 50%, transparent 100%)",
                }} />
              </div>

              {/* Channel Info */}
              <div style={{ padding: "0 28px 24px", marginTop: -44, position: "relative" }}>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 20, marginBottom: 24, flexWrap: "wrap" }}>
                  <img
                    src={channelData.thumbnail}
                    alt={channelData.title}
                    style={{
                      width: 88,
                      height: 88,
                      borderRadius: "50%",
                      border: "4px solid rgba(12,12,12,1)",
                      objectFit: "cover",
                      background: "#111",
                      boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 200, paddingBottom: 4 }}>
                    <h2 style={{ fontSize: 24, fontWeight: 700, color: "var(--text-primary)", margin: 0, marginBottom: 6 }}>
                      {channelData.title}
                    </h2>
                    <div style={{ display: "flex", gap: 12, alignItems: "center", fontSize: 13, color: "var(--text-tertiary)" }}>
                      {channelData.publishedAt && (
                        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                          Joined {new Date(channelData.publishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        </span>
                      )}
                      {channelData.country && (
                        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                          {channelData.country}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={handleDisconnect}
                    style={{
                      padding: "8px 16px", borderRadius: "var(--radius-md)", border: "1px solid var(--glass-border)",
                      background: "rgba(255,255,255,0.03)", color: "var(--text-secondary)", fontSize: 13, fontWeight: 500,
                      cursor: "pointer", transition: "all var(--transition-fast)", marginBottom: 4,
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(239,68,68,0.4)"; e.currentTarget.style.color = "#f87171"; e.currentTarget.style.background = "rgba(239,68,68,0.1)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--glass-border)"; e.currentTarget.style.color = "var(--text-secondary)"; e.currentTarget.style.background = "rgba(255,255,255,0.03)"; }}
                  >
                    Disconnect
                  </button>
                </div>

                {channelData.description && (
                  <div style={{ fontSize: 14, color: "var(--text-secondary)", marginBottom: 24, lineHeight: 1.6, background: "rgba(255,255,255,0.02)", padding: 16, borderRadius: "var(--radius-md)", border: "1px solid var(--glass-border)" }}>
                    {channelData.description}
                  </div>
                )}

                {/* Stats row */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16 }}>
                  {[
                    { label: "Subscribers", value: formatCount(channelData.subscriberCount), color: "#ef4444" },
                    { label: "Total Views", value: formatCount(channelData.viewCount), color: "#06b6d4" },
                    { label: "Total Videos", value: formatCount(channelData.videoCount), color: "#a855f7" },
                    { label: "Avg Views / Video", value: formatCount(avgViews), color: "#10b981" },
                  ].map((s) => (
                    <div key={s.label} style={{
                      padding: "16px", borderRadius: "var(--radius-md)",
                      background: "linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)",
                      border: "1px solid var(--glass-border)",
                    }}>
                      <div style={{ fontSize: 11, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8, fontWeight: 500 }}>
                        {s.label}
                      </div>
                      <div style={{ fontSize: 28, fontWeight: 700, color: s.color, letterSpacing: "-0.02em" }}>
                        {s.value}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))", gap: 24, marginBottom: 40 }}>
              {/* Top Videos */}
              <div className="glass-card-static" style={{ padding: 24 }}>
                <div className="section-title" style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                  Top Videos (Most Viewed)
                </div>
                {channelData.topVideos && channelData.topVideos.length > 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    {channelData.topVideos.map((vid: any, i: number) => (
                      <VideoCard key={vid.id} video={vid} badge={`#${i + 1} TOP`} />
                    ))}
                  </div>
                ) : (
                  <div className="empty-state" style={{ padding: 32 }}>Belum ada video di channel ini.</div>
                )}
              </div>

              {/* Latest Videos */}
              <div className="glass-card-static" style={{ padding: 24 }}>
                <div className="section-title" style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#14b8a6" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                  Latest Videos
                </div>
                {channelData.latestVideos && channelData.latestVideos.length > 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    {channelData.latestVideos.map((vid: any, i: number) => (
                      <VideoCard key={vid.id} video={vid} badge="NEW" />
                    ))}
                  </div>
                ) : (
                  <div className="empty-state" style={{ padding: 32 }}>Belum ada video di channel ini.</div>
                )}
              </div>
            </div>
          </>
        ) : (
          /* Connect Channel Form */
          <div
            className="glass-card-static"
            style={{ padding: 28, marginBottom: 32 }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
              <div style={{
                width: 44,
                height: 44,
                borderRadius: "50%",
                background: "rgba(239, 68, 68, 0.1)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="#ef4444">
                  <path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z"/>
                  <polygon fill="#fff" points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02"/>
                </svg>
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)" }}>
                  Connect Your YouTube Channel
                </div>
                <div style={{ fontSize: 13, color: "var(--text-tertiary)" }}>
                  Enter your Channel ID or Handle to display your stats
                </div>
              </div>
            </div>

            <form onSubmit={handleSaveChannel} style={{ display: "flex", gap: 12 }}>
              <input
                type="text"
                placeholder="@handle or UCxxxxxxxx"
                value={channelInput}
                onChange={(e) => setChannelInput(e.target.value)}
                required
                className="input-field"
                style={{ flex: 1 }}
              />
              <button type="submit" className="btn btn-primary" disabled={loadingChannel}>
                {loadingChannel ? <><span className="spinner"/>Connecting...</> : "Connect"}
              </button>
            </form>

            {channelError && (
              <div style={{
                marginTop: 12,
                padding: "10px 14px",
                borderRadius: "var(--radius-md)",
                fontSize: 13,
                background: "rgba(239, 68, 68, 0.1)",
                border: "1px solid rgba(239, 68, 68, 0.2)",
                color: "#fca5a5",
              }}>
                {channelError}
              </div>
            )}
          </div>
        )}

        {/* App Progress Section */}
        <div className="section-title">Content Progress</div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 16,
            marginBottom: 40,
          }}
        >
          {progressCards.map((stat) => (
            <div
              key={stat.label}
              className="glass-card-static"
              style={{ padding: "20px 24px" }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--text-tertiary)",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    fontWeight: 500,
                  }}
                >
                  {stat.label}
                </div>
                <span style={{ fontSize: 18 }}>{stat.icon}</span>
              </div>
              {loadingStats ? (
                <div className="skeleton" style={{ width: 40, height: 32 }} />
              ) : (
                <div
                  style={{
                    fontSize: 32,
                    fontWeight: 700,
                    color: stat.color,
                    letterSpacing: "-0.02em",
                  }}
                >
                  {stat.value}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
}