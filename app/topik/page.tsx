"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type TopikItem = {
  id: string;
  judul: string;
  deskripsi?: string | null;
  isi_topik?: any;
  created_at: string;
};

type NaskahItem = {
  id: string;
  judul: string;
  sumber_topik_id?: string | null;
  isi_naskah?: string | null;
};

function cleanTitle(text: string) {
  if (!text) return "";
  let cleaned = text;
  cleaned = cleaned.replace(/^(naskah|visual|topik|topic)\s*[-:]\s*/i, "");
  return cleaned.trim();
}

function resolveContent(raw: any): any {
  if (!raw) return {};
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return { deskripsi: raw };
    }
  }
  return raw;
}

function TopikContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [topikList, setTopikList] = useState<TopikItem[]>([]);
  const [naskahList, setNaskahList] = useState<NaskahItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Form input topik baru
  const [judulTopik, setJudulTopik] = useState("");
  const [deskripsiTopik, setDeskripsiTopik] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Filter Status (ALL | PROCESSED | UNPROCESSED)
  const [filterStatus, setFilterStatus] = useState<"ALL" | "PROCESSED" | "UNPROCESSED">("ALL");

  async function fetchTopik() {
    setLoading(true);
    try {
      const res = await fetch("/api/topik");
      const json = await res.json();
      if (Array.isArray(json?.data)) setTopikList(json.data);
    } catch (e) {
      console.error("[TopikUI] Fetch error:", e);
    } finally {
      setLoading(false);
    }
  }

  async function fetchNaskah() {
    try {
      const res = await fetch("/api/naskah");
      const json = await res.json();
      if (Array.isArray(json?.data)) setNaskahList(json.data);
    } catch (e) {
      console.error("[TopikUI] Fetch naskah error:", e);
    }
  }

  useEffect(() => {
    fetchTopik();
    fetchNaskah();
  }, []);

  async function handleAddTopik(e: React.FormEvent) {
    e.preventDefault();
    if (!judulTopik.trim()) return alert("Judul topik wajib diisi.");

    setSubmitting(true);
    try {
      const res = await fetch("/api/topik", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          judul: cleanTitle(judulTopik),
          deskripsi: deskripsiTopik
        }),
      });

      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || "Gagal menyimpan topik");

      setJudulTopik("");
      setDeskripsiTopik("");
      fetchTopik();
    } catch (err: any) {
      alert(err.message || "Terjadi kesalahan saat menyimpan topik");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteTopik(id: string) {
    if (!confirm("Yakin ingin menghapus topik ini?")) return;
    try {
      await fetch(`/api/topik/${id}`, { method: "DELETE" });
      fetchTopik();
    } catch (e) {
      console.error("[TopikUI] Delete error:", e);
    }
  }

  // Cek apakah topik t sudah dibuatkan naskah (Relational Check)
  function checkHasNaskah(topik: TopikItem): boolean {
    if (!Array.isArray(naskahList) || naskahList.length === 0) return false;

    return naskahList.some((n) => {
      // 1. Cek Relasi ID
      if (n.sumber_topik_id && n.sumber_topik_id === topik.id) return true;

      // 2. Cek Kesamaan Judul
      const cleanTopikJudul = cleanTitle(topik.judul).toLowerCase();
      const cleanNaskahJudul = cleanTitle(n.judul).toLowerCase();
      return cleanTopikJudul.length > 3 && cleanNaskahJudul.includes(cleanTopikJudul);
    });
  }

  // Filter daftar topik
  const filteredTopikList = topikList.filter((t) => {
    const hasNaskah = checkHasNaskah(t);
    if (filterStatus === "PROCESSED") return hasNaskah;
    if (filterStatus === "UNPROCESSED") return !hasNaskah;
    return true;
  });

  return (
    <div className="animate-fade-in">
      <div style={{ marginBottom: 16 }}>
        <p className="page-subtitle">
          Manajemen Ide Topik & Pelacak Status Pembuatan Naskah.
        </p>
      </div>

      {/* Form Tambah Topik */}
      <div className="glass-card-static" style={{ padding: 22, marginBottom: 24 }}>
        <form onSubmit={handleAddTopik}>
          <div style={{ marginBottom: 14 }}>
            <label className="form-label">Judul Topik Baru *</label>
            <input
              type="text"
              placeholder="Contoh: Sejarah Penemuan Deodoran Pertama di Dunia"
              value={judulTopik}
              onChange={(e) => setJudulTopik(e.target.value)}
              className="select-field"
            />
          </div>

          <div style={{ marginBottom: 18 }}>
            <label className="form-label">Deskripsi / Catatan Topik (Opsional)</label>
            <textarea
              placeholder="Detail ide, sudut pandang cerita, atau fakta penting..."
              value={deskripsiTopik}
              onChange={(e) => setDeskripsiTopik(e.target.value)}
              rows={3}
              className="textarea-field"
            />
          </div>

          <button type="submit" disabled={submitting} className="btn btn-primary" style={{ width: "100%" }}>
            {submitting ? "Menyimpan Ide Topik..." : "Simpan Topik"}
          </button>
        </form>
      </div>

      {/* Filter Status Cepat */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
        <div className="section-title" style={{ margin: 0 }}>
          Daftar Topik ({filteredTopikList.length} dari {topikList.length})
        </div>

        <div style={{ display: "flex", gap: 6, background: "var(--bg-secondary)", padding: 4, borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)" }}>
          <button
            type="button"
            onClick={() => setFilterStatus("ALL")}
            style={{
              padding: "4px 10px",
              fontSize: 11,
              fontWeight: 600,
              borderRadius: "var(--radius-xs)",
              border: "none",
              cursor: "pointer",
              background: filterStatus === "ALL" ? "#38bdf8" : "transparent",
              color: filterStatus === "ALL" ? "#000" : "var(--text-secondary)"
            }}
          >
            Semua
          </button>
          <button
            type="button"
            onClick={() => setFilterStatus("UNPROCESSED")}
            style={{
              padding: "4px 10px",
              fontSize: 11,
              fontWeight: 600,
              borderRadius: "var(--radius-xs)",
              border: "none",
              cursor: "pointer",
              background: filterStatus === "UNPROCESSED" ? "rgba(255, 255, 255, 0.15)" : "transparent",
              color: filterStatus === "UNPROCESSED" ? "#fff" : "var(--text-secondary)",
              display: "flex",
              alignItems: "center",
              gap: 4
            }}
          >
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#9ca3af", display: "inline-block" }} />
            Belum Naskah
          </button>
          <button
            type="button"
            onClick={() => setFilterStatus("PROCESSED")}
            style={{
              padding: "4px 10px",
              fontSize: 11,
              fontWeight: 600,
              borderRadius: "var(--radius-xs)",
              border: "none",
              cursor: "pointer",
              background: filterStatus === "PROCESSED" ? "rgba(34, 197, 94, 0.2)" : "transparent",
              color: filterStatus === "PROCESSED" ? "#4ade80" : "var(--text-secondary)",
              display: "flex",
              alignItems: "center",
              gap: 4
            }}
          >
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#22c55e", display: "inline-block" }} />
            Sudah Naskah
          </button>
        </div>
      </div>

      {/* List Topik */}
      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 70 }} />)}
        </div>
      ) : filteredTopikList.length === 0 ? (
        <div className="glass-card-static" style={{ padding: 24, textAlign: "center", fontSize: 12, color: "var(--text-tertiary)" }}>
          {filterStatus === "UNPROCESSED"
            ? "Semua topik sudah dibuatkan naskah!"
            : filterStatus === "PROCESSED"
            ? "Belum ada topik yang diproses ke naskah."
            : "Belum ada topik tersimpan."}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {filteredTopikList.map((item) => {
            const hasNaskah = checkHasNaskah(item);
            const content = resolveContent(item.isi_topik);
            const desc = item.deskripsi || content.deskripsi || "";

            return (
              <div key={item.id} className="glass-card-static" style={{ padding: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: 240 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      {/* Indikator Bundar 🟢 / ⚪ */}
                      <span
                        title={hasNaskah ? "Sudah diproses ke Naskah" : "Belum diproses ke Naskah"}
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: "50%",
                          background: hasNaskah ? "#22c55e" : "#9ca3af",
                          boxShadow: hasNaskah ? "0 0 8px rgba(34, 197, 94, 0.6)" : "none",
                          flexShrink: 0
                        }}
                      />
                      <h3 style={{ fontSize: 15, fontWeight: 600, margin: 0, color: "var(--text-primary)" }}>
                        {cleanTitle(item.judul)}
                      </h3>
                    </div>

                    {desc && (
                      <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "4px 0 0 18px", lineHeight: 1.4 }}>
                        {desc}
                      </p>
                    )}

                    <div style={{ marginTop: 8, marginLeft: 18, display: "flex", gap: 8, alignItems: "center" }}>
                      <span className="badge badge-neutral" style={{ fontSize: 10, display: "flex", alignItems: "center", gap: 4 }}>
                        {hasNaskah ? (
                          <>
                            <span style={{ color: "#4ade80" }}>🟢 Sudah Ada Naskah</span>
                          </>
                        ) : (
                          <>
                            <span style={{ color: "#9ca3af" }}>⚪ Belum Ada Naskah</span>
                          </>
                        )}
                      </span>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <button
                      onClick={() => router.push(`/naskah?topikId=${item.id}&judul=${encodeURIComponent(item.judul)}`)}
                      className={`btn btn-sm ${hasNaskah ? "btn-secondary" : "btn-primary"}`}
                    >
                      {hasNaskah ? "Lihat/Buat Naskah Lagi" : "Buat Naskah"}
                    </button>
                    <button onClick={() => handleDeleteTopik(item.id)} className="btn btn-danger btn-sm">
                      Hapus
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function TopikPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div className="spinner" style={{ width: 28, height: 28 }} />
      </div>
    }>
      <TopikContent />
    </Suspense>
  );
}
