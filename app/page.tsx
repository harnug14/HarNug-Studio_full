"use client";

import { useEffect, useState } from "react";
import DashboardLayout from "./components/DashboardLayout";
import Link from "next/link";

interface Stats {
  referensi: number;
  topik: number;
  naskah: number;
  visual: number;
}

const QUICK_ACTIONS = [
  {
    label: "Referensi",
    href: "/referensi",
    description: "Analisis channel YouTube untuk riset konten",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8" />
        <path d="M21 21l-4.35-4.35" />
      </svg>
    ),
    color: "#a855f7",
  },
  {
    label: "Topik",
    href: "/topik",
    description: "Kelola ide topik video Shorts",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 1 1 7.072 0l-.548.547A3.374 3.374 0 0 0 14 18.469V19a2 2 0 1 1-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
      </svg>
    ),
    color: "#06b6d4",
  },
  {
    label: "Naskah",
    href: "/naskah",
    description: "Tulis dan kelola naskah video",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6" />
        <path d="M16 13H8" />
        <path d="M16 17H8" />
      </svg>
    ),
    color: "#14b8a6",
  },
  {
    label: "Visual",
    href: "/visual",
    description: "Panduan visual & storyboard",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" />
        <line x1="7" y1="2" x2="7" y2="22" />
        <line x1="17" y1="2" x2="17" y2="22" />
        <line x1="2" y1="12" x2="22" y2="12" />
      </svg>
    ),
    color: "#f59e0b",
  },
  {
    label: "AI Chat",
    href: "/ai-chat",
    description: "Chat dengan AI untuk generate konten",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
    color: "#ec4899",
  },
  {
    label: "API Keys",
    href: "/settings/api-keys",
    description: "Kelola kunci API YouTube & Gemini",
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
      </svg>
    ),
    color: "#6366f1",
  },
];

export default function Home() {
  const [stats, setStats] = useState<Stats>({ referensi: 0, topik: 0, naskah: 0, visual: 0 });
  const [loadingStats, setLoadingStats] = useState(true);

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

  const statCards = [
    { label: "Referensi", value: stats.referensi, color: "#a855f7" },
    { label: "Topik", value: stats.topik, color: "#06b6d4" },
    { label: "Naskah", value: stats.naskah, color: "#14b8a6" },
    { label: "Visual", value: stats.visual, color: "#f59e0b" },
  ];

  return (
    <DashboardLayout>
      <div className="animate-fade-in">
        {/* Header */}
        <div className="page-header">
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">
            Selamat datang di HarNug Studio — kelola konten YouTube Shorts Anda dengan AI.
          </p>
        </div>

        {/* Stats */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 16,
            marginBottom: 40,
          }}
        >
          {statCards.map((stat) => (
            <div
              key={stat.label}
              className="glass-card-static"
              style={{ padding: "20px 24px" }}
            >
              <div
                style={{
                  fontSize: 12,
                  color: "var(--text-tertiary)",
                  marginBottom: 8,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  fontWeight: 500,
                }}
              >
                {stat.label}
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

        {/* Workflow */}
        <div className="glass-card-static" style={{ padding: "20px 24px", marginBottom: 40 }}>
          <div className="section-title" style={{ marginBottom: 12, fontSize: 14, color: "var(--text-tertiary)" }}>
            💡 Alur Kerja
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 0,
              flexWrap: "wrap",
              fontSize: 13,
            }}
          >
            {["Referensi", "→", "Topik", "→", "Naskah", "→", "Visual"].map(
              (item, i) =>
                item === "→" ? (
                  <span key={i} style={{ color: "var(--text-muted)", margin: "0 8px", fontSize: 16 }}>
                    →
                  </span>
                ) : (
                  <span
                    key={i}
                    style={{
                      padding: "4px 12px",
                      borderRadius: "var(--radius-full)",
                      background: "rgba(168, 85, 247, 0.08)",
                      color: "var(--accent-purple)",
                      fontWeight: 500,
                      fontSize: 13,
                    }}
                  >
                    {item}
                  </span>
                )
            )}
            <span style={{ color: "var(--text-muted)", marginLeft: 12, fontSize: 12 }}>
              (semuanya bisa di-generate via AI Chat)
            </span>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="section-title">Menu Cepat</div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
            gap: 16,
          }}
        >
          {QUICK_ACTIONS.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              style={{ textDecoration: "none" }}
            >
              <div
                className="glass-card"
                style={{
                  padding: "24px",
                  cursor: "pointer",
                  height: "100%",
                }}
              >
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: "var(--radius-md)",
                    background: `${action.color}15`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: action.color,
                    marginBottom: 14,
                  }}
                >
                  {action.icon}
                </div>
                <div
                  style={{
                    fontSize: 15,
                    fontWeight: 600,
                    color: "var(--text-primary)",
                    marginBottom: 6,
                  }}
                >
                  {action.label}
                </div>
                <div
                  style={{
                    fontSize: 13,
                    color: "var(--text-tertiary)",
                    lineHeight: 1.5,
                  }}
                >
                  {action.description}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
}