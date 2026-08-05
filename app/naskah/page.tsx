"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type Naskah = {
  id: string;
  judul: string;
  isi_naskah: string | null;
  english_script: string | null;
  fact_check_result: any | null;
  sumber_topik_id: string | null;
  status: string;
  created_at: string;
};

type Topik = {
  id: string;
  judul: string;
  catatan: string | null;
};

type ChannelProfile = {
  id: string;
  profile_name: string;
  channel_link: string | null;
  channel_analysis_entries?: any[];
};

function cleanTitle(text: string) {
  if (!text) return "";
  let cleaned = text;
  cleaned = cleaned.replace(/^visual\s*package\s*[-:]\s*/i, "");
  cleaned = cleaned.replace(/^(naskah|visual|topik|topic)\s*[-:]\s*/i, "");
  cleaned = cleaned.replace(/^naskah\s*[-:]\s*/i, "");
  return cleaned.trim();
}

function NaskahContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryTopikId = searchParams.get("topikId");
  const queryJudul = searchParams.get("judul");

  const [items, setItems] = useState<Naskah[]>([]);
  const [topikList, setTopikList] = useState<Topik[]>([]);
  const [channelProfiles, setChannelProfiles] = useState<ChannelProfile[]>([]);
  const [loading, setLoading] = useState(true);

  const [activeTab, setActiveTab] = useState<"generator" | "manual">("generator");
  const [selectedTopikId, setSelectedTopikId] = useState(queryTopikId || "");
  const [judulTopik, setJudulTopik] = useState(queryJudul ? cleanTitle(queryJudul) : "");
  const [catatanTopik, setCatatanTopik] = useState("");
  const [tone, setTone] = useState("Natural & Antusias");
  const [targetPanjang, setTargetPanjang] = useState("45-60 detik (130-160 kata)");
  const [referenceProfileId, setReferenceProfileId] = useState("");

  const isManualMode = !referenceProfileId;

  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState("");

  const [manualJudul, setManualJudul] = useState("");
  const [manualIsi, setManualIsi] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editJudul, setEditJudul] = useState("");
  const [editIsi, setEditIsi] = useState("");
  const [editEnglishIsi, setEditEnglishIsi] = useState("");

  const [translateLoading, setTranslateLoading] = useState<string | null>(null);
  const [activeModalItem, setActiveModalItem] = useState<{ naskah: Naskah; type: "fact-check" | "translation" } | null>(null);

  async function fetchNaskah() {
    setLoading(true);
    try {
      const res = await fetch("/api/naskah");
      const json = await res.json();
      if (json.data) setItems(json.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function fetchTopikList() {
    try {
      const res = await fetch("/api/topik");
      const json = await res.json();
      if (json.data) setTopikList(json.data);
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
    fetchNaskah();
    fetchTopikList();
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

  useEffect(() => {
    if (queryTopikId && queryJudul) {
      setSelectedTopikId(queryTopikId);
      setJudulTopik(cleanTitle(queryJudul));
    }
  }, [queryTopikId, queryJudul]);

  function handleSelectTopik(id: string) {
    setSelectedTopikId(id);
    const t = topikList.find((x) => x.id === id);
    if (t) {
      setJudulTopik(cleanTitle(t.judul));
      setCatatanTopik(t.catatan || "");
    }
  }

  async function handleGenerateScript(e: React.FormEvent) {
    e.preventDefault();
    if (!judulTopik.trim()) return alert("Judul topik wajib diisi");

    setGenerating(true);
    setGenError("");

    try {
      const res = await fetch("/api/naskah/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topikId: selectedTopikId || null,
          judulTopik: cleanTitle(judulTopik),
          catatanTopik,
          tone,
          targetPanjang,
          referenceProfileId: referenceProfileId || null,
        }),
      });

      const json = await res.json();
      if (json.error) {
        setGenError(json.error);
      } else {
        fetchNaskah();
        setSelectedTopikId("");
        setJudulTopik("");
        setCatatanTopik("");
      }
    } catch (err: any) {
      setGenError(err.message || "Gagal membuat naskah");
    } finally {
      setGenerating(false);
    }
  }

  async function handleManualAdd(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setMessage("");

    const res = await fetch("/api/naskah", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ judul: cleanTitle(manualJudul), isiNaskah: manualIsi }),
    });
    const json = await res.json();

    if (json.error) {
      setMessage("error:" + json.error);
    } else {
      setManualJudul("");
      setManualIsi("");
      setMessage("success:Naskah berhasil disimpan");
      fetchNaskah();
    }
    setSubmitting(false);
  }

  async function handleRunTranslation(naskahId: string) {
    setTranslateLoading(naskahId);
    try {
      const res = await fetch(`/api/naskah/${naskahId}/translate`, { method: "POST" });
      const json = await res.json();
      if (json.error) {
        alert("Translation error: " + json.error);
      } else {
        fetchNaskah();
        if (json.data) {
          setActiveModalItem({ naskah: json.data, type: "translation" });
        }
      }
    } catch (err: any) {
      alert("Translation gagal: " + err.message);
    } finally {
      setTranslateLoading(null);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Yakin mau hapus naskah ini?")) return;
    await fetch(`/api/naskah/${id}`, { method: "DELETE" });
    fetchNaskah();
  }

  function startEdit(item: Naskah) {
    setEditingId(item.id);
    setEditJudul(cleanTitle(item.judul));
    setEditIsi(item.isi_naskah || "");
    setEditEnglishIsi(item.english_script || "");
  }

  function cancelEdit() {
    setEditingId(null);
    setEditJudul("");
    setEditIsi("");
    setEditEnglishIsi("");
  }

  async function handleSaveEdit(id: string) {
    await fetch(`/api/naskah/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        judul: cleanTitle(editJudul),
        isiNaskah: editIsi,
        englishScript: editEnglishIsi,
      }),
    });
    cancelEdit();
    fetchNaskah();
  }

  function handleBuatVisual(item: Naskah) {
    router.push(`/visual?naskahId=${item.id}&judul=${encodeURIComponent(cleanTitle(item.judul))}`);
  }

  return (
    <div className="animate-fade-in">
      {/* Subtitle Halaman */}
      <div style={{ marginBottom: 16 }}>
        <p className="page-subtitle">
          Penyusunan naskah YouTube Shorts dan terjemahan ke bahasa Inggris.
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        <button
          onClick={() => setActiveTab("generator")}
          className={`btn ${activeTab === "generator" ? "btn-primary" : "btn-secondary"} btn-sm`}
        >
          AI Script Generator
        </button>
        <button
          onClick={() => setActiveTab("manual")}
          className={`btn ${activeTab === "manual" ? "btn-primary" : "btn-secondary"} btn-sm`}
        >
          Input Manual
        </button>
      </div>

      {/* AI Generator Form */}
      {activeTab === "generator" && (
        <div className="glass-card-static" style={{ padding: 22, marginBottom: 24 }}>
          <form onSubmit={handleGenerateScript}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
              <div>
                <label className="form-label">Pilih dari Bank Topik (Opsional)</label>
                <select
                  value={selectedTopikId}
                  onChange={(e) => handleSelectTopik(e.target.value)}
                  className="select-field"
                >
                  <option value="">-- Naskah Baru / Manual --</option>
                  {topikList.map((t) => (
                    <option key={t.id} value={t.id}>
                      {cleanTitle(t.judul)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="form-label">Judul Topik Video *</label>
                <input
                  type="text"
                  placeholder="Judul topik..."
                  value={judulTopik}
                  onChange={(e) => setJudulTopik(e.target.value)}
                  required
                  className="input-field"
                />
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label className="form-label">Catatan / Konteks (Opsional)</label>
              <textarea
                placeholder="Detail fakta atau konteks khusus..."
                value={catatanTopik}
                onChange={(e) => setCatatanTopik(e.target.value)}
                rows={2}
                className="textarea-field"
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label className="form-label">Referensi Kalibrasi Gaya (Opsional)</label>
              <select
                value={referenceProfileId}
                onChange={(e) => setReferenceProfileId(e.target.value)}
                className="select-field"
              >
                <option value="">Tanpa Referensi</option>
                {channelProfiles.map((prof) => (
                  <option key={prof.id} value={prof.id}>
                    {prof.profile_name}
                  </option>
                ))}
              </select>
            </div>

            {isManualMode && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                <div>
                  <label className="form-label">Tone & Gaya Tutur</label>
                  <select
                    value={tone}
                    onChange={(e) => setTone(e.target.value)}
                    className="select-field"
                  >
                    <option value="Natural & Antusias">Natural & Antusias</option>
                    <option value="Serius & Misterius">Serius & Misterius</option>
                    <option value="Santai & Humor">Santai & Humor</option>
                    <option value="Edukatif & Inspiratif">Edukatif & Inspiratif</option>
                  </select>
                </div>

                <div>
                  <label className="form-label">Target Durasi</label>
                  <select
                    value={targetPanjang}
                    onChange={(e) => setTargetPanjang(e.target.value)}
                    className="select-field"
                  >
                    <option value="30-45 detik (100-130 kata)">30-45 detik (100-130 kata)</option>
                    <option value="45-60 detik (130-160 kata)">45-60 detik (130-160 kata)</option>
                    <option value="60+ detik (160-200 kata)">60+ detik (160-200 kata)</option>
                  </select>
                </div>
              </div>
            )}

            <button type="submit" disabled={generating} className="btn btn-primary" style={{ width: "100%" }}>
              {generating ? <><span className="spinner" /> Menyusun Script Draft...</> : "Generate Script Draft"}
            </button>
          </form>

          {genError && (
            <div style={{ marginTop: 12, fontSize: 12, color: "var(--status-error)", background: "rgba(248, 113, 113, 0.1)", padding: "8px 12px", borderRadius: "var(--radius-md)" }}>
              {genError}
            </div>
          )}
        </div>
      )}

      {/* Manual Form */}
      {activeTab === "manual" && (
        <div className="glass-card-static" style={{ padding: 22, marginBottom: 24 }}>
          <form onSubmit={handleManualAdd}>
            <div style={{ marginBottom: 12 }}>
              <label className="form-label">Judul Naskah *</label>
              <input
                type="text"
                placeholder="Judul naskah..."
                value={manualJudul}
                onChange={(e) => setManualJudul(e.target.value)}
                required
                className="input-field"
              />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label className="form-label">Isi Naskah *</label>
              <textarea
                placeholder="Isi naskah..."
                value={manualIsi}
                onChange={(e) => setManualIsi(e.target.value)}
                required
                rows={5}
                className="textarea-field"
              />
            </div>
            <button type="submit" disabled={submitting} className="btn btn-primary btn-sm">
              {submitting ? <><span className="spinner" /> Menyimpan...</> : "Tambah Naskah Manual"}
            </button>
            {message && (
              <div style={{ marginTop: 10, fontSize: 12, color: message.startsWith("error:") ? "var(--status-error)" : "var(--status-success)" }}>
                {message.replace(/^(error:|success:)/, "")}
              </div>
            )}
          </form>
        </div>
      )}

      {/* Script List */}
      <div className="section-title">
        Daftar Script ({items.length})
      </div>

      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 90 }} />)}
        </div>
      ) : items.length === 0 ? (
        <div className="glass-card-static" style={{ padding: 24, textAlign: "center", fontSize: 12, color: "var(--text-tertiary)" }}>
          Belum ada script tersimpan.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {items.map((item) => {
            const isEditing = editingId === item.id;

            return (
              <div key={item.id} id={item.id} className="glass-card-static" style={{ padding: 18 }}>
                {isEditing ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <input
                      type="text"
                      value={editJudul}
                      onChange={(e) => setEditJudul(e.target.value)}
                      className="input-field"
                    />
                    <div>
                      <label className="form-label">Naskah (Bahasa Indonesia)</label>
                      <textarea
                        value={editIsi}
                        onChange={(e) => setEditIsi(e.target.value)}
                        rows={5}
                        className="textarea-field"
                      />
                    </div>
                    <div>
                      <label className="form-label">Naskah (English)</label>
                      <textarea
                        value={editEnglishIsi}
                        onChange={(e) => setEditEnglishIsi(e.target.value)}
                        rows={5}
                        className="textarea-field"
                      />
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={() => handleSaveEdit(item.id)} className="btn btn-primary btn-sm">Simpan Edit</button>
                      <button onClick={cancelEdit} className="btn btn-ghost btn-sm">Batal</button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                      <div>
                        <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0, color: "var(--text-primary)" }}>
                          {cleanTitle(item.judul)}
                        </h3>
                        <div style={{ marginTop: 6, display: "flex", gap: 6 }}>
                          <span className={`badge ${item.status === "approved" ? "badge-success" : item.status === "review" ? "badge-warning" : "badge-neutral"}`}>
                            {item.status === "approved" ? "✓ Terverifikasi" : item.status === "review" ? "Perlu Review" : "Draft"}
                          </span>
                          {item.english_script && <span className="badge badge-neutral">English</span>}
                        </div>
                      </div>
                    </div>

                    <div style={{
                      background: "var(--bg-tertiary)",
                      padding: 12,
                      borderRadius: "var(--radius-md)",
                      fontSize: 12,
                      lineHeight: 1.5,
                      color: "var(--text-secondary)",
                      whiteSpace: "pre-wrap",
                      maxHeight: 140,
                      overflowY: "auto",
                      marginBottom: 14,
                      border: "1px solid var(--border-subtle)",
                    }}>
                      {item.isi_naskah || "(Kosong)"}
                    </div>

                    {/* Toolbar */}
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                      <button
                        onClick={() => handleRunTranslation(item.id)}
                        disabled={translateLoading === item.id}
                        className="btn btn-secondary btn-sm"
                      >
                        {translateLoading === item.id ? <span className="spinner" /> : "Translate EN"}
                      </button>

                      {item.english_script && (
                        <button
                          onClick={() => setActiveModalItem({ naskah: item, type: "translation" })}
                          className="btn btn-ghost btn-sm"
                        >
                          English Script
                        </button>
                      )}

                      <button onClick={() => startEdit(item)} className="btn btn-ghost btn-sm">Edit</button>

                      <button
                        onClick={() => handleBuatVisual(item)}
                        className="btn btn-primary btn-sm"
                        style={{ marginLeft: "auto" }}
                      >
                        Visual →
                      </button>

                      <button onClick={() => handleDelete(item.id)} className="btn btn-danger btn-sm">Hapus</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Detail */}
      {activeModalItem && (
        <div style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.7)",
          backdropFilter: "blur(4px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 100,
          padding: 16,
        }}>
          <div className="glass-card-static" style={{ width: "100%", maxWidth: 540, maxHeight: "85vh", overflowY: "auto", padding: 22 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0, color: "var(--text-primary)" }}>
                English Script
              </h3>
              <button onClick={() => setActiveModalItem(null)} className="btn btn-ghost btn-sm">✕</button>
            </div>

            {activeModalItem.type === "translation" && (
              <div>
                <div style={{
                  background: "var(--bg-tertiary)",
                  padding: 14,
                  borderRadius: "var(--radius-md)",
                  fontSize: 13,
                  lineHeight: 1.5,
                  whiteSpace: "pre-wrap",
                  marginBottom: 16,
                  border: "1px solid var(--border-subtle)",
                }}>
                  {activeModalItem.naskah.english_script}
                </div>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(activeModalItem.naskah.english_script || "");
                    alert("English Script disalin!");
                  }}
                  className="btn btn-primary btn-sm"
                >
                  Salin English Script
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function NaskahPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div className="spinner" style={{ width: 28, height: 28 }} />
      </div>
    }>
      <NaskahContent />
    </Suspense>
  );
}