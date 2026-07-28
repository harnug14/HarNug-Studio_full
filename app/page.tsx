"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import DashboardLayout from "./components/DashboardLayout";
import ExportModal from "@/components/ExportModal";

type DashboardStats = {
  totalTopics: number;
  totalScripts: number;
  totalVisuals: number;
  draftCount: number;
  reviewCount: number;
  approvedCount: number;
};

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats>({
    totalTopics: 0,
    totalScripts: 0,
    totalVisuals: 0,
    draftCount: 0,
    reviewCount: 0,
    approvedCount: 0,
  });
  const [recentScripts, setRecentScripts] = useState<any[]>([]);
  const [recentVisuals, setRecentVisuals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [exportModalItem, setExportModalItem] = useState<{ item: any; type: "script" | "visual" } | null>(null);

  async function fetchDashboardData() {
    setLoading(true);
    try {
      const [topikRes, naskahRes, visualRes] = await Promise.all([
        fetch("/api/topik").then((r) => r.json()),
        fetch("/api/naskah").then((r) => r.json()),
        fetch("/api/visual").then((r) => r.json()),
      ]);

      const topics = topikRes.data || [];
      const scripts = naskahRes.data || [];
      const visuals = visualRes.data || [];

      let drafts = 0;
      let reviews = 0;
      let approveds = 0;

      scripts.forEach((s: any) => {
        if (s.status === "approved") approveds++;
        else if (s.status === "review") reviews++;
        else drafts++;
      });

      setStats({
        totalTopics: topics.length,
        totalScripts: scripts.length,
        totalVisuals: visuals.length,
        draftCount: drafts,
        reviewCount: reviews,
        approvedCount: approveds,
      });

      setRecentScripts(scripts.slice(0, 5));
      setRecentVisuals(visuals.slice(0, 5));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchDashboardData();
  }, []);

  return (
    <DashboardLayout>
      <div className="animate-fade-in">
        {/* Header */}
        <div className="page-header" style={{ marginBottom: 28 }}>
          <h1 className="page-title">HarNug Studio V2.0 Dashboard</h1>
          <p className="page-subtitle">
            Ringkasan status produksi, alur pipeline dari ideation hingga export package siap rilis.
          </p>
        </div>

        {/* Status Pipeline Cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 32 }}>
          <div className="glass-card-static" style={{ padding: 18 }}>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 600 }}>💡 TOPIC BANK</div>
            <div style={{ fontSize: 28, fontWeight: 700, marginTop: 4, color: "var(--text-primary)" }}>
              {loading ? "..." : stats.totalTopics}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 4 }}>Ide topik tervalidasi 50 poin</div>
          </div>

          <div className="glass-card-static" style={{ padding: 18 }}>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 600 }}>📜 SCRIPT DRAFTS</div>
            <div style={{ fontSize: 28, fontWeight: 700, marginTop: 4, color: "var(--text-primary)" }}>
              {loading ? "..." : stats.draftCount}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 4 }}>Sedang dalam tahap penyusunan</div>
          </div>

          <div className="glass-card-static" style={{ padding: 18 }}>
            <div style={{ fontSize: 12, color: "var(--status-warning)", fontWeight: 600 }}>🔍 NEEDS FACT CHECK REVIEW</div>
            <div style={{ fontSize: 28, fontWeight: 700, marginTop: 4, color: "var(--status-warning)" }}>
              {loading ? "..." : stats.reviewCount}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 4 }}>Perlu verifikasi manual</div>
          </div>

          <div className="glass-card-static" style={{ padding: 18 }}>
            <div style={{ fontSize: 12, color: "var(--status-success)", fontWeight: 600 }}>✓ VERIFIED SCRIPTS</div>
            <div style={{ fontSize: 28, fontWeight: 700, marginTop: 4, color: "var(--status-success)" }}>
              {loading ? "..." : stats.approvedCount}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 4 }}>Siap produksi visual & voiceover</div>
          </div>

          <div className="glass-card-static" style={{ padding: 18 }}>
            <div style={{ fontSize: 12, color: "var(--accent-primary)", fontWeight: 600 }}>🎨 VISUAL PACKAGES</div>
            <div style={{ fontSize: 28, fontWeight: 700, marginTop: 4, color: "var(--accent-primary)" }}>
              {loading ? "..." : stats.totalVisuals}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 4 }}>Storyboard & Prompt Google Flow</div>
          </div>
        </div>

        {/* Production Pipeline Visual Flow */}
        <div className="glass-card-static" style={{ padding: 24, marginBottom: 32 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, color: "var(--text-primary)" }}>
            🚀 Alur Produksi Video (Modular Pipeline)
          </h3>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, textAlign: "center" }}>
            <Link href="/referensi" style={{ textDecoration: "none" }}>
              <div style={{ background: "rgba(255,255,255,0.03)", padding: 14, borderRadius: 8, border: "1px solid rgba(255,255,255,0.06)", cursor: "pointer" }}>
                <div style={{ fontSize: 20, marginBottom: 4 }}>📺</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>1. Analisis Channel</div>
                <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>Kalibrasi Niche</div>
              </div>
            </Link>

            <Link href="/topik" style={{ textDecoration: "none" }}>
              <div style={{ background: "rgba(255,255,255,0.03)", padding: 14, borderRadius: 8, border: "1px solid rgba(255,255,255,0.06)", cursor: "pointer" }}>
                <div style={{ fontSize: 20, marginBottom: 4 }}>💡</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>2. Topic Framework</div>
                <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>Validator 50 Poin</div>
              </div>
            </Link>

            <Link href="/naskah" style={{ textDecoration: "none" }}>
              <div style={{ background: "rgba(255,255,255,0.03)", padding: 14, borderRadius: 8, border: "1px solid rgba(255,255,255,0.06)", cursor: "pointer" }}>
                <div style={{ fontSize: 20, marginBottom: 4 }}>📜</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>3. Script Framework</div>
                <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>Hook → Timeline</div>
              </div>
            </Link>

            <Link href="/naskah" style={{ textDecoration: "none" }}>
              <div style={{ background: "rgba(255,255,255,0.03)", padding: 14, borderRadius: 8, border: "1px solid rgba(255,255,255,0.06)", cursor: "pointer" }}>
                <div style={{ fontSize: 20, marginBottom: 4 }}>🔍</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>4. Fact Check & Trans</div>
                <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>Konsistensi & EN</div>
              </div>
            </Link>

            <Link href="/visual" style={{ textDecoration: "none" }}>
              <div style={{ background: "rgba(255,255,255,0.03)", padding: 14, borderRadius: 8, border: "1px solid rgba(255,255,255,0.06)", cursor: "pointer" }}>
                <div style={{ fontSize: 20, marginBottom: 4 }}>🎨</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>5. Visual Framework</div>
                <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>Storyboard & Prompts</div>
              </div>
            </Link>
          </div>
        </div>

        {/* Recent Pipeline Activity & Quick Export */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 24 }}>
          {/* Recent Scripts */}
          <div className="glass-card-static" style={{ padding: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)" }}>📜 Script Terbaru</h3>
              <Link href="/naskah" style={{ fontSize: 12, color: "var(--accent-primary)", textDecoration: "none" }}>Lihat Semua →</Link>
            </div>

            {recentScripts.length === 0 ? (
              <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>Belum ada script tersimpan.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {recentScripts.map((s) => (
                  <div key={s.id} style={{ background: "rgba(0,0,0,0.2)", padding: 12, borderRadius: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {s.judul}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
                        Status: <span style={{ color: s.status === "approved" ? "var(--status-success)" : "var(--text-secondary)" }}>{s.status}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => setExportModalItem({ item: s, type: "script" })}
                      className="btn btn-ghost btn-sm"
                      style={{ fontSize: 11 }}
                    >
                      📦 Export
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent Visual Packages */}
          <div className="glass-card-static" style={{ padding: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)" }}>🎨 Visual Package Terbaru</h3>
              <Link href="/visual" style={{ fontSize: 12, color: "var(--accent-primary)", textDecoration: "none" }}>Lihat Semua →</Link>
            </div>

            {recentVisuals.length === 0 ? (
              <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>Belum ada Visual Package tersimpan.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {recentVisuals.map((v) => (
                  <div key={v.id} style={{ background: "rgba(0,0,0,0.2)", padding: 12, borderRadius: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {v.judul}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--accent-primary)", marginTop: 2 }}>
                        {v.isi_visual?.scenes?.length || 0} Scenes & Prompts
                      </div>
                    </div>
                    <button
                      onClick={() => setExportModalItem({ item: v, type: "visual" })}
                      className="btn btn-ghost btn-sm"
                      style={{ fontSize: 11 }}
                    >
                      📦 Export
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Export Modal */}
        {exportModalItem && (
          <ExportModal
            item={exportModalItem.item}
            type={exportModalItem.type}
            onClose={() => setExportModalItem(null)}
          />
        )}
      </div>
    </DashboardLayout>
  );
}