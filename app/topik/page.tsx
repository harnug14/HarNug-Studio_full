"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import DashboardLayout from "../components/DashboardLayout";

type Topik = {
  id: string;
  judul: string;
  catatan: string | null;
  status: string;
  created_at: string;
};

type TopicCandidate = {
  judul: string;
  penjelasan: string;
  skor: {
    relevansi: number;
    visual: number;
    struktur: number;
    hook: number;
    viral: number;
    total: number;
  };
  alasanKelulusan: string;
  saved?: boolean;
};

type ChannelProfile = {
  id: string;
  profile_name: string;
  channel_link: string | null;
  channel_analysis_entries?: any[];
};

export default function TopikPage() {
  const router = useRouter();
  const [items, setItems] = useState<Topik[]>([]);
  const [loading, setLoading] = useState(true);

  // Manual Add Form State
  const [judul, setJudul] = useState("");
  const [catatan, setCatatan] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  // Edit State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editJudul, setEditJudul] = useState("");
  const [editCatatan, setEditCatatan] = useState("");

  // AI Workflow Generator State
  const [activeTab, setActiveTab] = useState<"generator" | "manual">("generator");
  const [referenceProfileId, setReferenceProfileId] = useState("");
  const [channelProfiles, setChannelProfiles] = useState<ChannelProfile[]>([]);

  // Manual parameters — only used when "Tanpa Referensi" is selected
  const [kategori, setKategori] = useState("Sains & Fakta Unik");
  const [customKategori, setCustomKategori] = useState("");
  const [durasi, setDurasi] = useState("45-60 detik");
  const [topikDisukai, setTopikDisukai] = useState("");
  const [topikDitolak, setTopikDitolak] = useState("");
  const [jumlah, setJumlah] = useState(5);

  const [generating, setGenerating] = useState(false);
  const [candidates, setCandidates] = useState<TopicCandidate[]>([]);
  const [genError, setGenError] = useState("");

  const isManualMode = !referenceProfileId;

  async function fetchTopik() {
    setLoading(true);
    const res = await fetch("/api/topik");
    const json = await res.json();
    if (json.data) setItems(json.data);
    setLoading(false);
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
    fetchChannelProfiles();
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setMessage("");

    const res = await fetch("/api/topik", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ judul, catatan }),
    });
    const json = await res.json();

    if (json.error) {
      setMessage("error:" + json.error);
    } else {
      setJudul("");
      setCatatan("");
      setMessage("success:Topik berhasil disimpan");
      fetchTopik();
    }
    setSubmitting(false);
  }

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    setGenerating(true);
    setGenError("");
    setCandidates([]);

    const selectedKat = kategori === "Custom" ? customKategori : kategori;

    try {
      const res = await fetch("/api/topik/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kategori: selectedKat,
          durasi,
          topikDisukai,
          topikDitolak,
          jumlah,
          referenceProfileId: referenceProfileId || null,
        }),
      });

      const json = await res.json();
      if (json.error) {
        setGenError(json.error);
      } else if (json.data) {
        setCandidates(json.data);
      }
    } catch (err: any) {
      setGenError(err.message || "Gagal membuat ide topik");
    } finally {
      setGenerating(false);
    }
  }

  async function handleSaveCandidate(candidate: TopicCandidate, index: number) {
    const res = await fetch("/api/topik", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        judul: candidate.judul,
        catatan: `${candidate.penjelasan}\n\nSkor: ${candidate.skor.total}/50 | ${candidate.alasanKelulusan}`,
      }),
    });
    const json = await res.json();
    if (!json.error) {
      const updated = [...candidates];
      updated[index].saved = true;
      setCandidates(updated);
      fetchTopik();
    } else {
      alert("Gagal menyimpan: " + json.error);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Yakin mau hapus topik ini?")) return;
    await fetch(`/api/topik/${id}`, { method: "DELETE" });
    fetchTopik();
  }

  function startEdit(item: Topik) {
    setEditingId(item.id);
    setEditJudul(item.judul);
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
      body: JSON.stringify({ judul: editJudul, catatan: editCatatan }),
    });
    cancelEdit();
    fetchTopik();
  }

  function handleBuatNaskah(item: Topik) {
    router.push(`/naskah?topikId=${item.id}&judul=${encodeURIComponent(item.judul)}`);
  }

  return (
    <DashboardLayout>
      <div className="animate-fade-in">
        <div className="page-header" style={{ marginBottom: 24 }}>
          <h1 className="page-title">Topic Framework & Bank</h1>
          <p className="page-subtitle">
            Hasilkan ide topik tervalidasi 50 poin atau kelola Topic Bank Anda untuk tahap produksi selanjutnya.
          </p>
        </div>

        {/* Tab Selection */}
        <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
          <button
            onClick={() => setActiveTab("generator")}
            className={`btn ${activeTab === "generator" ? "btn-primary" : "btn-ghost"}`}
          >
            ✨ Workflow AI Generator (50 Poin)
          </button>
          <button
            onClick={() => setActiveTab("manual")}
            className={`btn ${activeTab === "manual" ? "btn-primary" : "btn-ghost"}`}
          >
            ➕ Input Manual
          </button>
        </div>

        {/* AI Generator Workflow */}
        {activeTab === "generator" && (
          <div className="glass-card-static" style={{ padding: 24, marginBottom: 32 }}>
            <form onSubmit={handleGenerate}>
              {/* Channel Profile Selector */}
              <div style={{ marginBottom: isManualMode ? 20 : 20 }}>
                <label className="form-label">Referensi Channel (Opsional)</label>
                <select
                  value={referenceProfileId}
                  onChange={(e) => setReferenceProfileId(e.target.value)}
                  className="select-field"
                >
                  <option value="">Tanpa Referensi (Framework Murni)</option>
                  {channelProfiles.map((prof) => (
                    <option key={prof.id} value={prof.id}>
                      {prof.profile_name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Show Manual Parameter Form ONLY when Tanpa Referensi is selected */}
              {isManualMode && (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16, marginBottom: 16 }}>
                    <div>
                      <label className="form-label">Kategori Content</label>
                      <select
                        value={kategori}
                        onChange={(e) => setKategori(e.target.value)}
                        className="select-field"
                      >
                        <option value="Sains & Fakta Unik">Sains & Fakta Unik</option>
                        <option value="Fashion & Gaya Hidup">Fashion & Gaya Hidup</option>
                        <option value="Olahraga & Kesehatan">Olahraga & Kesehatan</option>
                        <option value="Sejarah & Budaya">Sejarah & Budaya</option>
                        <option value="Teknologi & Otomotif">Teknologi & Otomotif</option>
                        <option value="Misteri & Storytelling">Misteri & Storytelling</option>
                        <option value="Custom">Kategori Custom...</option>
                      </select>
                    </div>

                    {kategori === "Custom" && (
                      <div>
                        <label className="form-label">Kategori Custom</label>
                        <input
                          type="text"
                          placeholder="Masukkan kategori spesifik..."
                          value={customKategori}
                          onChange={(e) => setCustomKategori(e.target.value)}
                          required
                          className="input-field"
                        />
                      </div>
                    )}

                    <div>
                      <label className="form-label">Target Durasi Video</label>
                      <select
                        value={durasi}
                        onChange={(e) => setDurasi(e.target.value)}
                        className="select-field"
                      >
                        <option value="30-45 detik">30-45 detik</option>
                        <option value="45-60 detik">45-60 detik</option>
                        <option value="60+ detik">60+ detik</option>
                      </select>
                    </div>

                    <div>
                      <label className="form-label">Jumlah Kandidat Target</label>
                      <select
                        value={jumlah}
                        onChange={(e) => setJumlah(Number(e.target.value))}
                        className="select-field"
                      >
                        <option value={3}>3 Kandidat (Cepat)</option>
                        <option value={5}>5 Kandidat (Standar)</option>
                        <option value={8}>8 Kandidat (Lengkap)</option>
                      </select>
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16, marginBottom: 20 }}>
                    <div>
                      <label className="form-label">Topik Disukai / Fokus (Opsional)</label>
                      <input
                        type="text"
                        placeholder="Contoh: Sabun, Motor, High heels..."
                        value={topikDisukai}
                        onChange={(e) => setTopikDisukai(e.target.value)}
                        className="input-field"
                      />
                    </div>
                    <div>
                      <label className="form-label">Topik Ditolak / Dihindari (Opsional)</label>
                      <input
                        type="text"
                        placeholder="Contoh: Korupsi, Bencana..."
                        value={topikDitolak}
                        onChange={(e) => setTopikDitolak(e.target.value)}
                        className="input-field"
                      />
                    </div>
                  </div>
                </>
              )}

              {/* Generate Button */}
              <button type="submit" disabled={generating} className="btn btn-primary" style={{ width: "100%", justifyContent: "center" }}>
                {generating ? (
                  <><span className="spinner" />Menjalankan Validator AI 50 Poin...</>
                ) : (
                  <>🚀 Generate Candidate Topik</>
                )}
              </button>
            </form>

            {genError && (
              <div style={{
                marginTop: 16,
                padding: "12px 16px",
                borderRadius: "var(--radius-md)",
                background: "rgba(239, 68, 68, 0.1)",
                border: "1px solid var(--status-error)",
                color: "var(--status-error)",
                fontSize: 13
              }}>
                {genError}
              </div>
            )}
          </div>
        )}

        {/* AI Generated Candidate Cards */}
        {candidates.length > 0 && (
          <div style={{ marginBottom: 36 }}>
            <div className="section-title" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>Hasil Candidate Topik (Lolos Skor &gt;= 40/50)</span>
              <span className="badge badge-success">{candidates.length} Lolos Validasi</span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16, marginTop: 16 }}>
              {candidates.map((cand, idx) => (
                <div key={idx} className="glass-card-static" style={{ padding: 20, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 10 }}>
                      <h4 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)", flex: 1 }}>
                        {cand.judul}
                      </h4>
                      <span className="badge badge-accent" style={{ fontSize: 13, fontWeight: 700 }}>
                        {cand.skor?.total || 40}/50
                      </span>
                    </div>

                    <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5, marginBottom: 14 }}>
                      {cand.penjelasan}
                    </p>

                    {/* Breakdown Scores */}
                    {cand.skor && (
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 4, background: "rgba(255,255,255,0.03)", padding: 8, borderRadius: 8, marginBottom: 12, textAlign: "center" }}>
                        <div>
                          <div style={{ fontSize: 10, color: "var(--text-secondary)" }}>Audience</div>
                          <div style={{ fontSize: 12, fontWeight: 600 }}>{cand.skor.relevansi}/10</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 10, color: "var(--text-secondary)" }}>Visual</div>
                          <div style={{ fontSize: 12, fontWeight: 600 }}>{cand.skor.visual}/10</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 10, color: "var(--text-secondary)" }}>Timeline</div>
                          <div style={{ fontSize: 12, fontWeight: 600 }}>{cand.skor.struktur}/10</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 10, color: "var(--text-secondary)" }}>Hook</div>
                          <div style={{ fontSize: 12, fontWeight: 600 }}>{cand.skor.hook}/10</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 10, color: "var(--text-secondary)" }}>Viral</div>
                          <div style={{ fontSize: 12, fontWeight: 600 }}>{cand.skor.viral}/10</div>
                        </div>
                      </div>
                    )}

                    {cand.alasanKelulusan && (
                      <div style={{ fontSize: 11, color: "var(--accent-primary)", fontStyle: "italic", marginBottom: 16 }}>
                        &quot;{cand.alasanKelulusan}&quot;
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => handleSaveCandidate(cand, idx)}
                    disabled={cand.saved}
                    className={`btn ${cand.saved ? "btn-ghost" : "btn-primary"} btn-sm`}
                    style={{ width: "100%", justifyContent: "center" }}
                  >
                    {cand.saved ? "✓ Tersimpan di Topic Bank" : "💾 Simpan ke Topic Bank"}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Manual Add Form */}
        {activeTab === "manual" && (
          <div className="glass-card-static" style={{ padding: 24, marginBottom: 32 }}>
            <form onSubmit={handleAdd}>
              <div style={{ marginBottom: 16 }}>
                <label className="form-label">Judul topik</label>
                <input
                  type="text"
                  placeholder="Contoh: Fakta unik tentang ..."
                  value={judul}
                  onChange={(e) => setJudul(e.target.value)}
                  required
                  className="input-field"
                />
              </div>

              <div style={{ marginBottom: 20 }}>
                <label className="form-label">Catatan (opsional)</label>
                <textarea
                  placeholder="Catatan tambahan tentang topik ini..."
                  value={catatan}
                  onChange={(e) => setCatatan(e.target.value)}
                  rows={3}
                  className="textarea-field"
                />
              </div>

              <button type="submit" disabled={submitting} className="btn btn-primary">
                {submitting ? (
                  <><span className="spinner" />Menyimpan...</>
                ) : (
                  <>➕ Tambah Topik Manual</>
                )}
              </button>

              {message && (
                <div style={{
                  marginTop: 12,
                  padding: "10px 14px",
                  borderRadius: "var(--radius-md)",
                  fontSize: 13,
                  background: "var(--glass-bg)",
                  border: `1px solid ${message.startsWith("error:") ? "var(--status-error)" : "var(--status-success)"}`,
                  color: message.startsWith("error:") ? "var(--status-error)" : "var(--status-success)",
                }}>
                  {message.replace(/^(error:|success:)/, "")}
                </div>
              )}
            </form>
          </div>
        )}

        {/* Topic Bank List */}
        <div className="section-title">Topic Bank ({items.length})</div>

        {loading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {[1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 80 }} />)}
          </div>
        ) : items.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">💡</div>
            <div className="empty-state-text">Belum ada topik tersimpan di Topic Bank.</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {items.map((item) => {
              const isEditing = editingId === item.id;

              return (
                <div key={item.id} className="glass-card-static" style={{ padding: 18 }}>
                  {isEditing ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
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
                    <>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            onClick={() => handleBuatNaskah(item)}
                            style={{
                              fontWeight: 600,
                              cursor: "pointer",
                              fontSize: 15,
                              color: "var(--text-primary)",
                              transition: "color var(--transition-fast)",
                            }}
                            title="Klik untuk lanjut buat naskah dari topik ini"
                          >
                            {item.judul}
                          </div>
                          {item.catatan && (
                            <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 6, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                              {item.catatan}
                            </div>
                          )}
                          <div style={{ marginTop: 8 }}>
                            <span className="badge badge-neutral">{item.status || "draft"}</span>
                          </div>
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                        <button onClick={() => startEdit(item)} className="btn btn-ghost btn-sm">
                          Edit
                        </button>
                        <button onClick={() => handleBuatNaskah(item)} className="btn btn-ghost btn-sm" style={{ color: "var(--accent-primary)" }}>
                          📜 Buat Script Draft →
                        </button>
                        <button onClick={() => handleDelete(item.id)} className="btn btn-danger btn-sm">Hapus</button>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}