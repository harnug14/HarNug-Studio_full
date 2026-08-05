"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type TopikCandidate = {
  judul: string;
  skor: number;
  alasanSkor: string;
  hookFormula: string;
  retentionAngle: string;
  targetDurasi: string;
  kategori: string;
};

type TopikItem = {
  id: string;
  judul: string;
  catatan: string | null;
  created_at: string;
};

type ChannelProfile = {
  id: string;
  profile_name: string;
};

export default function TopicPage() {
  const router = useRouter();
  const [items, setItems] = useState<TopikItem[]>([]);
  const [channelProfiles, setChannelProfiles] = useState<ChannelProfile[]>([]);
  const [loading, setLoading] = useState(true);

  // Tab State
  const [activeTab, setActiveTab] = useState<"generator" | "manual">("generator");

  // AI Generator State
  const [referenceProfileId, setReferenceProfileId] = useState("");
  const isManualMode = !referenceProfileId;

  const [kategoriContent, setKategoriContent] = useState("Sains & Fakta Unik");
  const [targetDurasi, setTargetDurasi] = useState("45-60 detik");
  const [topikDisukai, setTopikDisukai] = useState("");
  const [topikDitolak, setTopikDitolak] = useState("");
  const [jumlahKandidat, setJumlahKandidat] = useState(5);

  const [generating, setGenerating] = useState(false);
  const [candidates, setCandidates] = useState<TopikCandidate[]>([]);
  const [genError, setGenError] = useState("");

  // Manual State
  const [manualJudul, setManualJudul] = useState("");
  const [manualCatatan, setManualCatatan] = useState("");
  const [submittingManual, setSubmittingManual] = useState(false);
  const [message, setMessage] = useState("");

  // Edit State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editJudul, setEditJudul] = useState("");
  const [editCatatan, setEditCatatan] = useState("");

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

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    setGenerating(true);
    setGenError("");
    setCandidates([]);

    try {
      const res = await fetch("/api/topik/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kategoriContent: isManualMode ? kategoriContent : undefined,
          targetDurasi: isManualMode ? targetDurasi : undefined,
          topikDisukai,
          topikDitolak,
          jumlahKandidat: Number(jumlahKandidat),
          referenceProfileId: referenceProfileId || null,
        }),
      });

      const json = await res.json();
      if (json.error) {
        setGenError(json.error);
      } else if (json.data && json.data.candidates) {
        setCandidates(json.data.candidates);
      } else if (Array.isArray(json.data)) {
        setCandidates(json.data);
      }
    } catch (err: any) {
      setGenError(err.message || "Gagal melakukan analisis generator.");
    } finally {
      setGenerating(false);
    }
  }

  async function handleSaveCandidate(candidate: TopikCandidate) {
    try {
      const notes = candidate.alasanSkor
        ? `Skor: ${candidate.skor}/50 | ${candidate.alasanSkor}\nHook: ${candidate.hookFormula}\nAngle: ${candidate.retentionAngle}`
        : `${(candidate as any).penjelasan || ""}\n\nSkor: ${(candidate as any).skor?.total || candidate.skor}/50`;

      const res = await fetch("/api/topik", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          judul: candidate.judul,
          catatan: notes,
        }),
      });
      const json = await res.json();
      if (json.data) {
        fetchTopik();
        alert("Topik berhasil disimpan ke Bank Topik!");
      }
    } catch (e) {
      console.error(e);
    }
  }

  async function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmittingManual(true);
    setMessage("");

    const res = await fetch("/api/topik", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ judul: manualJudul, catatan: manualCatatan }),
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

  function handleBuatScript(item: TopikItem) {
    router.push(`/naskah?topikId=${item.id}&judul=${encodeURIComponent(item.judul)}`);
  }

  return (
    <div className="animate-fade-in">
      <div style={{ marginBottom: 24 }}>
        <h1 className="page-title">Topic</h1>
        <p className="page-subtitle">
          Generate ide topik berpotensi viral (AI 50-Point Framework) atau kelola Bank Topik Anda.
        </p>
      </div>

      {/* Tabs */}
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

      {/* AI Topic Generator Form */}
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

            {/* Parameter manual HANYA tampil jika "Tanpa Referensi" dipilih */}
            {isManualMode && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 14 }}>
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

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 18 }}>
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
              {genError}
            </div>
          )}
        </div>
      )}

      {/* Manual Form */}
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
          <div className="section-title">
            Hasil Rekomendasi Topik ({candidates.length})
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {candidates.map((cand, idx) => (
              <div key={idx} className="glass-card-static" style={{ padding: 18 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <span className="badge badge-neutral">Skor: {cand.skor || (cand as any).skor?.total}/50</span>
                      {cand.targetDurasi && <span className="badge badge-neutral">{cand.targetDurasi}</span>}
                    </div>
                    <h3 style={{ fontSize: 16, fontWeight: 600, margin: "0 0 6px 0", color: "var(--text-primary)" }}>
                      {cand.judul}
                    </h3>
                    <p style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5, margin: "0 0 8px 0" }}>
                      {cand.alasanSkor || (cand as any).penjelasan}
                    </p>
                    {(cand.hookFormula || cand.retentionAngle) && (
                      <div style={{ fontSize: 11, color: "var(--text-tertiary)", display: "flex", gap: 12 }}>
                        {cand.hookFormula && <span>Hook: {cand.hookFormula}</span>}
                        {cand.retentionAngle && <span>Angle: {cand.retentionAngle}</span>}
                      </div>
                    )}
                  </div>
                  <button onClick={() => handleSaveCandidate(cand)} className="btn btn-secondary btn-sm" style={{ flexShrink: 0 }}>
                    + Simpan ke Bank
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bank Topik List */}
      <div className="section-title">
        Bank Topik ({items.length})
      </div>

      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 80 }} />)}
        </div>
      ) : items.length === 0 ? (
        <div className="glass-card-static" style={{ padding: 24, textAlign: "center", fontSize: 12, color: "var(--text-tertiary)" }}>
          Belum ada topik tersimpan.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {items.map((item) => {
            const isEditing = editingId === item.id;

            return (
              <div key={item.id} className="glass-card-static" style={{ padding: 16 }}>
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
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <h3 style={{ fontSize: 15, fontWeight: 600, margin: "0 0 4px 0", color: "var(--text-primary)" }}>
                        {item.judul}
                      </h3>
                      {item.catatan && (
                        <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                          {item.catatan}
                        </p>
                      )}
                    </div>

                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      <button onClick={() => handleBuatScript(item)} className="btn btn-primary btn-sm">
                        Buat Script →
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