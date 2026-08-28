"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type TopikCandidate = {
  judul: string;
  skor: number | { total: number };
  alasanSkor?: string;
  penjelasan?: string;
  alasanKelulusan?: string;
  hookFormula?: string;
  retentionAngle?: string;
  targetDurasi?: string;
  kategori?: string;
};

type TopikItem = {
  id: string;
  judul: string;
  catatan: string | null;
  created_at: string;
};

type NaskahItem = {
  id: string;
  judul: string;
  sumber_topik_id?: string | null;
};

type ChannelProfile = {
  id: string;
  profile_name: string;
};

function cleanTitle(text: string) {
  if (!text) return "";
  let cleaned = text;
  cleaned = cleaned.replace(/^visual\s*package\s*[-:]\s*/i, "");
  cleaned = cleaned.replace(/^(naskah|visual|topik|topic)\s*[-:]\s*/i, "");
  cleaned = cleaned.replace(/^naskah\s*[-:]\s*/i, "");
  return cleaned.trim();
}

function getScoreNumber(skor: any): number {
  if (typeof skor === "number") return skor;
  if (typeof skor === "object" && skor !== null && typeof skor.total === "number") {
    return skor.total;
  }
  return 0;
}

function getExplanationText(cand: any): string {
  if (cand.alasanSkor) return cand.alasanSkor;
  if (cand.penjelasan) return cand.penjelasan;
  if (cand.alasanKelulusan) return cand.alasanKelulusan;
  return "Topik potensial berdasarkan analisis AI.";
}

function getCleanNotes(catatan: string | null): string {
  if (!catatan) return "";
  return catatan.replace(/^\[.*?\]\s*/, "").trim();
}

function getCleanCategory(item: TopikItem): string {
  const rawCatatan = item.catatan || "";
  const match = rawCatatan.match(/^\[(.*?)\]/);
  let cat = match ? match[1].trim() : "";

  if (!cat || cat.toLowerCase() === "umum") {
    const text = `${item.judul} ${rawCatatan}`.toLowerCase();

    if (
      text.includes("profesi") ||
      text.includes("pekerjaan") ||
      text.includes("whipping boy") ||
      text.includes("groom of the stool") ||
      text.includes("knocker") ||
      text.includes("tukang") ||
      text.includes("digaji")
    ) {
      return "Profesi Kuno";
    }

    if (
      text.includes("taktik") ||
      text.includes("perang") ||
      text.includes("pelusium") ||
      text.includes("trepanasi") ||
      text.includes("bedah") ||
      text.includes("operasi") ||
      text.includes("bencana") ||
      text.includes("racun") ||
      text.includes("hantu")
    ) {
      return "Peristiwa & Taktik";
    }

    if (
      text.includes("sejarah") ||
      text.includes("asal-usul") ||
      text.includes("dasi") ||
      text.includes("kacamata") ||
      text.includes("sepatu") ||
      text.includes("shampo") ||
      text.includes("bantal") ||
      text.includes("kulkas") ||
      text.includes("es batu") ||
      text.includes("mentega") ||
      text.includes("sedotan") ||
      text.includes("popok") ||
      text.includes("deodoran") ||
      text.includes("uang") ||
      text.includes("lakban") ||
      text.includes("jam ") ||
      text.includes("alarm") ||
      text.includes("alat") ||
      text.includes("benda")
    ) {
      return "Asal-Usul Benda";
    }

    return "Tradisi & Perilaku";
  }

  return cat;
}

// 💡 EKSTRAK KATA KUNCI UTAMA DARI JUDUL UNTUK DETEKSI KEMBARAN
function extractKeywords(title: string): string[] {
  const stopwords = new Set([
    "sejarah", "asal-usul", "asal", "usul", "sebelum", "ada", "yang", "dan", "di", "dari", 
    "ke", "pada", "untuk", "cuma", "buat", "bikin", "jadi", "saat", "era", "zaman", "kuno", 
    "masa", "lalu", "dulu", "abad", "ini", "itu", "dalam", "dengan", "orang", "rakyat", "bangsa"
  ]);
  
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !stopwords.has(w));
}

export default function TopicPage() {
  const router = useRouter();
  const [items, setItems] = useState<TopikItem[]>([]);
  const [naskahList, setNaskahList] = useState<NaskahItem[]>([]);
  const [channelProfiles, setChannelProfiles] = useState<ChannelProfile[]>([]);
  const [loading, setLoading] = useState(true);

  const [activeTab, setActiveTab] = useState<"generator" | "manual">("generator");

  const [referenceProfileId, setReferenceProfileId] = useState("");
  const isManualMode = !referenceProfileId;

  const [kategoriContent, setKategoriContent] = useState("Sains & Fakta Unik");
  const [targetDurasi, setTargetDurasi] = useState("45-60 detik");
  const [topikDisukai, setTopikDisukai] = useState("");
  const [topikDitolak, setTopikDitolak] = useState("");
  const [jumlahKandidat, setJumlahKandidat] = useState(5);

  const [generating, setGenerating] = useState(false);
  const [candidates, setCandidates] = useState<TopikCandidate[]>([]);
  const [savingJudul, setSavingJudul] = useState<string | null>(null);
  const [genError, setGenError] = useState("");

  const [manualJudul, setManualJudul] = useState("");
  const [manualCatatan, setManualCatatan] = useState("");
  const [submittingManual, setSubmittingManual] = useState(false);
  const [message, setMessage] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editJudul, setEditJudul] = useState("");
  const [editCatatan, setEditCatatan] = useState("");

  // 💡 FILTER STATUS BARU: ALL | PROCESSED | UNPROCESSED | DUPLICATES
  const [filterStatus, setFilterStatus] = useState<"ALL" | "PROCESSED" | "UNPROCESSED" | "DUPLICATES">("ALL");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("cached_topic_candidates");
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setCandidates(parsed);
          }
        } catch (e) {
          console.error("Gagal membaca cache candidates:", e);
        }
      }
    }
  }, []);

  function updateCandidates(newCandidates: TopikCandidate[]) {
    setCandidates(newCandidates);
    if (typeof window !== "undefined") {
      if (newCandidates.length > 0) {
        localStorage.setItem("cached_topic_candidates", JSON.stringify(newCandidates));
      } else {
        localStorage.removeItem("cached_topic_candidates");
      }
    }
  }

  // 💡 SIMPAN TOPIK YANG TIDAK DIPILIH KE DAFTAR HITAM
  function recordIgnoredCandidates(discarded: TopikCandidate[]) {
    if (typeof window === "undefined" || discarded.length === 0) return;
    try {
      const existingStr = localStorage.getItem("harnug_rejected_history");
      const existing: string[] = existingStr ? JSON.parse(existingStr) : [];
      const newTitles = discarded.map((c) => cleanTitle(c.judul));
      const merged = Array.from(new Set([...existing, ...newTitles])).slice(-60);
      localStorage.setItem("harnug_rejected_history", JSON.stringify(merged));
    } catch (e) {
      console.error(e);
    }
  }

  async function fetchTopik() {
    setLoading(true);
    try {
      const res = await fetch("/api/topik");
      const json = await res.json();
      if (json.data) setItems(json.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function fetchNaskah() {
    try {
      const res = await fetch("/api/naskah");
      const json = await res.json();
      if (json.data) setNaskahList(json.data);
    } catch (e) {
      console.error(e);
    }
  }

  async function fetchChannelProfiles() {
    try {
      const res = await fetch("/api/channel-analysis");
      const json = await res.json();
      if (json.data) setChannelProfiles(json.data);
    } catch (e) {
      console.error(e);
    }
  }

  useEffect(() => {
    fetchTopik();
    fetchNaskah();
    fetchChannelProfiles();
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined" && window.location.hash && items.length > 0) {
      const targetId = window.location.hash.replace("#", "");
      if (targetId) {
        setTimeout(() => {
          const el = document.getElementById(targetId);
          if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "center" });
            el.style.transition = "border-color 0.5s ease, box-shadow 0.5s ease";
            el.style.borderColor = "#38bdf8";
            el.style.boxShadow = "0 0 12px rgba(56, 189, 248, 0.3)";
            setTimeout(() => {
              el.style.borderColor = "var(--border-subtle)";
              el.style.boxShadow = "none";
            }, 2500);
          }
        }, 300);
      }
    }
  }, [items]);

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    setGenerating(true);
    setGenError("");

    // Otomatis masukkan sisa kandidat yang tidak dipilih ke daftar hitam
    if (candidates.length > 0) {
      recordIgnoredCandidates(candidates);
    }

    let rejectedHistoryList: string[] = [];
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("harnug_rejected_history");
        if (stored) rejectedHistoryList = JSON.parse(stored);
      } catch {}
    }

    try {
      const res = await fetch("/api/topik/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kategori: isManualMode ? kategoriContent : undefined,
          durasi: isManualMode ? targetDurasi : undefined,
          topikDisukai,
          topikDitolak,
          jumlah: Number(jumlahKandidat),
          referenceProfileId: referenceProfileId || null,
          rejectedHistory: rejectedHistoryList,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `Server Error (${res.status}). Silakan coba lagi.`);
      }

      const json = await res.json();
      if (json.error) {
        setGenError(json.error);
      } else if (json.data && json.data.candidates && Array.isArray(json.data.candidates)) {
        updateCandidates(json.data.candidates);
      } else if (Array.isArray(json.data)) {
        updateCandidates(json.data);
      } else {
        setGenError("Gagal mengambil ide topik. Silakan coba lagi.");
      }
    } catch (err: any) {
      console.error("[TopicUI] Generate error:", err);
      setGenError(err.message || "Gagal membuat ide topik. Silakan coba lagi.");
    } finally {
      setGenerating(false);
    }
  }

  async function handleSaveCandidate(candidate: TopikCandidate) {
    setSavingJudul(candidate.judul);
    try {
      const numericScore = getScoreNumber(candidate.skor);
      const explanation = getExplanationText(candidate);
      const categoryTag = candidate.kategori || "Tradisi & Perilaku";
      
      let notes = `[${categoryTag}] Skor: ${numericScore}/50 | ${explanation}`;
      if (candidate.hookFormula) notes += `\nHook: ${candidate.hookFormula}`;
      if (candidate.retentionAngle) notes += `\nAngle: ${candidate.retentionAngle}`;

      const res = await fetch("/api/topik", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          judul: cleanTitle(candidate.judul),
          catatan: notes,
        }),
      });
      const json = await res.json();
      if (json.data) {
        fetchTopik();
        const remaining = candidates.filter(
          (c) => cleanTitle(c.judul) !== cleanTitle(candidate.judul)
        );
        updateCandidates(remaining);
      }
    } catch (e) {
      console.error(e);
      alert("Gagal menyimpan topik. Coba lagi.");
    } finally {
      setSavingJudul(null);
    }
  }

  function handleClearCandidates() {
    if (confirm("Bersihkan seluruh hasil rekomendasi yang belum disimpan?")) {
      recordIgnoredCandidates(candidates);
      updateCandidates([]);
    }
  }

  async function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmittingManual(true);
    setMessage("");

    const res = await fetch("/api/topik", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ judul: cleanTitle(manualJudul), catatan: manualCatatan }),
    });
    const json = await res.json();

    if (json.error) {
      setMessage("error:" + json.error);
    } else {
      setManualJudul("");
      setManualCatatan("");
      setMessage("success:Topik berhasil ditambahkan");
      fetchTopik();
    }
    setSubmittingManual(false);
  }

  async function handleDelete(id: string) {
    if (!confirm("Yakin mau hapus topik ini?")) return;
    await fetch(`/api/topik/${id}`, { method: "DELETE" });
    fetchTopik();
  }

  function startEdit(item: TopikItem) {
    setEditingId(item.id);
    setEditJudul(cleanTitle(item.judul));
    setEditCatatan(item.catatan || "");
  }

  function cancelEdit() {
    setEditingId(null);
    setEditJudul("");
    setEditCatatan("");
  }

  async function handleSaveEdit(id: string) {
    await fetch(`/api/topik/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ judul: cleanTitle(editJudul), catatan: editCatatan }),
    });
    cancelEdit();
    fetchTopik();
  }

  function handleBuatScript(item: TopikItem) {
    router.push(`/naskah?topikId=${item.id}&judul=${encodeURIComponent(cleanTitle(item.judul))}`);
  }

  function checkHasNaskah(topik: TopikItem): boolean {
    if (!Array.isArray(naskahList) || naskahList.length === 0) return false;

    return naskahList.some((n) => {
      if (n.sumber_topik_id && n.sumber_topik_id === topik.id) return true;
      const cleanT = cleanTitle(topik.judul).toLowerCase();
      const cleanN = cleanTitle(n.judul || "").toLowerCase();
      return cleanT.length > 3 && cleanN.includes(cleanT);
    });
  }

  // 💡 DETEKSI KEMBARAN/DUPLIKASI ANTAR 100 TOPIK DI DATABASE
  function findSimilarSibling(target: TopikItem): TopikItem | null {
    const targetWords = extractKeywords(cleanTitle(target.judul));
    if (targetWords.length === 0) return null;

    for (const other of items) {
      if (other.id === target.id) continue;
      const otherWords = extractKeywords(cleanTitle(other.judul));
      
      const overlap = targetWords.filter((w) => otherWords.includes(w));
      // Jika memiliki 2 kata kunci sama atau 1 kata benda unik sama
      if (overlap.length >= 2 || (overlap.length === 1 && overlap[0].length >= 5)) {
        return other;
      }
    }
    return null;
  }

  // Hitung jumlah topik yang punya kembaran
  const duplicateItems = items.filter((item) => findSimilarSibling(item) !== null);

  const filteredItems = items.filter((item) => {
    const hasNaskah = checkHasNaskah(item);
    if (filterStatus === "PROCESSED") return hasNaskah;
    if (filterStatus === "UNPROCESSED") return !hasNaskah;
    if (filterStatus === "DUPLICATES") return findSimilarSibling(item) !== null;
    return true;
  });

  return (
    <div className="animate-fade-in">
      <div style={{ marginBottom: 16 }}>
        <p className="page-subtitle">
          Generate ide topik berpotensi viral (AI 50-Point Framework) atau kelola Daftar Topic Anda.
        </p>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        <button
          onClick={() => setActiveTab("generator")}
          className={`btn ${activeTab === "generator" ? "btn-primary" : "btn-secondary"} btn-sm`}
        >
          AI Topic Generator
        </button>
        <button
          onClick={() => setActiveTab("manual")}
          className={`btn ${activeTab === "manual" ? "btn-primary" : "btn-secondary"} btn-sm`}
        >
          Input Manual
        </button>
      </div>

      {activeTab === "generator" && (
        <div className="glass-card-static" style={{ padding: 22, marginBottom: 24 }}>
          <form onSubmit={handleGenerate}>
            <div style={{ marginBottom: isManualMode ? 14 : 18 }}>
              <label className="form-label">Referensi Channel (Opsional)</label>
              <select
                value={referenceProfileId}
                onChange={(e) => setReferenceProfileId(e.target.value)}
                className="select-field"
              >
                <option value="">Tanpa Referensi (Framework Murni)</option>
                {channelProfiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.profile_name}
                  </option>
                ))}
              </select>
            </div>

            {isManualMode && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 14 }}>
                <div>
                  <label className="form-label">Kategori Content</label>
                  <select
                    value={kategoriContent}
                    onChange={(e) => setKategoriContent(e.target.value)}
                    className="select-field"
                  >
                    <option value="Sains & Fakta Unik">Sains & Fakta Unik</option>
                    <option value="Sejarah & Konspirasi">Sejarah & Konspirasi</option>
                    <option value="Teknologi & Masa Depan">Teknologi & Masa Depan</option>
                    <option value="Misteri & Horor">Misteri & Horor</option>
                    <option value="Pop Culture & Hiburan">Pop Culture & Hiburan</option>
                  </select>
                </div>

                <div>
                  <label className="form-label">Target Durasi</label>
                  <select
                    value={targetDurasi}
                    onChange={(e) => setTargetDurasi(e.target.value)}
                    className="select-field"
                  >
                    <option value="30-45 detik">30-45 detik</option>
                    <option value="45-60 detik">45-60 detik</option>
                    <option value="60+ detik">60+ detik</option>
                  </select>
                </div>

                <div>
                  <label className="form-label">Jumlah Kandidat</label>
                  <select
                    value={jumlahKandidat}
                    onChange={(e) => setJumlahKandidat(Number(e.target.value))}
                    className="select-field"
                  >
                    <option value={3}>3 Kandidat</option>
                    <option value={5}>5 Kandidat</option>
                    <option value={8}>8 Kandidat</option>
                  </select>
                </div>
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginBottom: 18 }}>
              <div>
                <label className="form-label">Topik Disukai / Fokus (Opsional)</label>
                <input
                  type="text"
                  placeholder="Contoh: Otomotif, High heels..."
                  value={topikDisukai}
                  onChange={(e) => setTopikDisukai(e.target.value)}
                  className="input-field"
                />
              </div>
              <div>
                <label className="form-label">Topik Ditolak (Opsional)</label>
                <input
                  type="text"
                  placeholder="Contoh: Bencana, Korupsi..."
                  value={topikDitolak}
                  onChange={(e) => setTopikDitolak(e.target.value)}
                  className="input-field"
                />
              </div>
            </div>

            <button type="submit" disabled={generating} className="btn btn-primary" style={{ width: "100%" }}>
              {generating ? <><span className="spinner" /> Menganalisis 50-Point Viral Potential...</> : "Generate Ide Topik"}
            </button>
          </form>

          {genError && (
            <div style={{ marginTop: 14, fontSize: 12, color: "var(--status-error)", background: "rgba(248, 113, 113, 0.1)", padding: "10px 14px", borderRadius: "var(--radius-md)" }}>
              ⚠️ {genError}
            </div>
          )}
        </div>
      )}

      {activeTab === "manual" && (
        <div className="glass-card-static" style={{ padding: 22, marginBottom: 24 }}>
          <form onSubmit={handleManualSubmit}>
            <div style={{ marginBottom: 12 }}>
              <label className="form-label">Judul Topik *</label>
              <input
                type="text"
                placeholder="Judul topik..."
                value={manualJudul}
                onChange={(e) => setManualJudul(e.target.value)}
                required
                className="input-field"
              />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label className="form-label">Catatan (Opsional)</label>
              <textarea
                placeholder="Catatan atau ide awal..."
                value={manualCatatan}
                onChange={(e) => setManualCatatan(e.target.value)}
                rows={3}
                className="textarea-field"
              />
            </div>
            <button type="submit" disabled={submittingManual} className="btn btn-primary btn-sm">
              {submittingManual ? <><span className="spinner" /> Menyimpan...</> : "Simpan Topik"}
            </button>
            {message && (
              <div style={{ marginTop: 10, fontSize: 12, color: message.startsWith("error:") ? "var(--status-error)" : "var(--status-success)" }}>
                {message.replace(/^(error:|success:)/, "")}
              </div>
            )}
          </form>
        </div>
      )}

      {/* Hasil Candidates AI Generator */}
      {candidates.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div className="section-title" style={{ margin: 0 }}>
              Hasil Rekomendasi Topik ({candidates.length})
            </div>
            <button onClick={handleClearCandidates} className="btn btn-ghost btn-sm" style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
              Bersihkan Hasil
            </button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {candidates.map((cand, idx) => {
              const numericScore = getScoreNumber(cand.skor);
              const explanationText = getExplanationText(cand);
              const isSavingThis = savingJudul === cand.judul;

              return (
                <div key={idx} className="glass-card-static" style={{ padding: 18 }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                        <span className="badge badge-neutral">Skor: {numericScore}/50</span>
                        {cand.kategori && (
                          <span
                            className="badge badge-neutral"
                            style={{
                              color: "#38bdf8",
                              background: "rgba(56, 189, 248, 0.12)",
                              border: "1px solid rgba(56, 189, 248, 0.3)",
                              fontWeight: 600
                            }}
                          >
                            🏷️ {cand.kategori}
                          </span>
                        )}
                        {cand.targetDurasi && <span className="badge badge-neutral">{cand.targetDurasi}</span>}
                      </div>
                      <h3 style={{ fontSize: 16, fontWeight: 600, margin: "0 0 6px 0", color: "var(--text-primary)", lineHeight: 1.35 }}>
                        {cleanTitle(cand.judul)}
                      </h3>
                      <p style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5, margin: "0 0 8px 0" }}>
                        {explanationText}
                      </p>
                      {(cand.hookFormula || cand.retentionAngle) && (
                        <div style={{ fontSize: 11, color: "var(--text-tertiary)", display: "flex", gap: 12, flexWrap: "wrap" }}>
                          {cand.hookFormula && <span>Hook: {cand.hookFormula}</span>}
                          {cand.retentionAngle && <span>Angle: {cand.retentionAngle}</span>}
                        </div>
                      )}
                    </div>
                    <div>
                      <button
                        onClick={() => handleSaveCandidate(cand)}
                        disabled={isSavingThis}
                        className="btn btn-secondary btn-sm"
                      >
                        {isSavingThis ? <><span className="spinner" /> Menyimpan...</> : "+ Simpan ke Daftar Topic"}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Daftar Topic List (Dengan Filter Kembar/Duplikat) */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
        <div className="section-title" style={{ margin: 0 }}>
          Daftar Topic ({filteredItems.length} dari {items.length})
        </div>

        <div style={{ display: "flex", gap: 6, background: "var(--bg-secondary)", padding: 4, borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)", flexWrap: "wrap" }}>
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

          {/* 💡 TOMBOL FILTER BARU: DETEKSI TOPIK KEMBAR */}
          <button
            type="button"
            onClick={() => setFilterStatus("DUPLICATES")}
            style={{
              padding: "4px 10px",
              fontSize: 11,
              fontWeight: 600,
              borderRadius: "var(--radius-xs)",
              border: "none",
              cursor: "pointer",
              background: filterStatus === "DUPLICATES" ? "rgba(239, 68, 68, 0.25)" : "transparent",
              color: filterStatus === "DUPLICATES" ? "#f87171" : "var(--text-secondary)",
              display: "flex",
              alignItems: "center",
              gap: 4
            }}
          >
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#ef4444", display: "inline-block" }} />
            ⚠️ Kembar/Mirip ({duplicateItems.length})
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 80 }} />)}
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="glass-card-static" style={{ padding: 24, textAlign: "center", fontSize: 12, color: "var(--text-tertiary)" }}>
          {filterStatus === "UNPROCESSED"
            ? "Semua topik sudah dibuatkan naskah!"
            : filterStatus === "PROCESSED"
            ? "Belum ada topik yang diproses ke naskah."
            : filterStatus === "DUPLICATES"
            ? "Bagus! Tidak ditemukan topik kembar/mirip di database Anda."
            : "Belum ada topik tersimpan."}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {filteredItems.map((item) => {
            const isEditing = editingId === item.id;
            const hasNaskah = checkHasNaskah(item);
            const itemKategori = getCleanCategory(item);
            const cleanNotes = getCleanNotes(item.catatan);
            const sibling = findSimilarSibling(item);

            return (
              <div key={item.id} id={item.id} className="glass-card-static" style={{ padding: 18, borderColor: sibling ? "rgba(239, 68, 68, 0.3)" : undefined }}>
                {isEditing ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <input
                      type="text"
                      value={editJudul}
                      onChange={(e) => setEditJudul(e.target.value)}
                      className="input-field"
                    />
                    <textarea
                      value={editCatatan}
                      onChange={(e) => setEditCatatan(e.target.value)}
                      rows={3}
                      className="textarea-field"
                    />
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={() => handleSaveEdit(item.id)} className="btn btn-primary btn-sm">Simpan</button>
                      <button onClick={cancelEdit} className="btn btn-ghost btn-sm">Batal</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <div style={{ width: "100%" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
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
                        <span
                          className="badge badge-neutral"
                          style={{
                            color: "#38bdf8",
                            background: "rgba(56, 189, 248, 0.12)",
                            border: "1px solid rgba(56, 189, 248, 0.3)",
                            fontSize: 10,
                            fontWeight: 600
                          }}
                        >
                          🏷️ {itemKategori}
                        </span>

                        {/* 💡 INDIKATOR JIKA ADA KEMBARAN DI DATABASE */}
                        {sibling && (
                          <span
                            className="badge badge-neutral"
                            style={{
                              color: "#f87171",
                              background: "rgba(239, 68, 68, 0.15)",
                              border: "1px solid rgba(239, 68, 68, 0.3)",
                              fontSize: 10,
                              fontWeight: 600
                            }}
                          >
                            ⚠️ Mirip: {cleanTitle(sibling.judul).slice(0, 30)}...
                          </span>
                        )}

                        <h3 style={{ fontSize: 15, fontWeight: 600, margin: 0, color: "var(--text-primary)", lineHeight: 1.35 }}>
                          {cleanTitle(item.judul)}
                        </h3>
                      </div>

                      {cleanNotes && (
                        <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "4px 0 0 18px", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                          {cleanNotes}
                        </p>
                      )}
                    </div>

                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", paddingTop: 4 }}>
                      <span className="badge badge-neutral" style={{ fontSize: 10, display: "inline-flex", alignItems: "center", gap: 4, marginRight: "auto" }}>
                        {hasNaskah ? (
                          <span style={{ color: "#4ade80" }}>🟢 Sudah Ada Naskah</span>
                        ) : (
                          <span style={{ color: "#9ca3af" }}>⚪ Belum Ada Naskah</span>
                        )}
                      </span>

                      <button onClick={() => handleBuatScript(item)} className={`btn btn-sm ${hasNaskah ? "btn-secondary" : "btn-primary"}`}>
                        {hasNaskah ? "Lihat/Buat Script Lagi →" : "Buat Script →"}
                      </button>
                      <button onClick={() => startEdit(item)} className="btn btn-secondary btn-sm">
                        Edit
                      </button>
                      <button onClick={() => handleDelete(item.id)} className="btn btn-danger btn-sm">
                        Hapus
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
