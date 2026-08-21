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

type VisualItem = {
  id: string;
  judul: string;
  sumber_naskah_id: string | null;
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
  const [visualList, setVisualList] = useState<VisualItem[]>([]);
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

  // Filter Status (ALL | PROCESSED | UNPROCESSED)
  const [filterStatus, setFilterStatus] = useState<"ALL" | "PROCESSED" | "UNPROCESSED">("ALL");

  // SET TOPIK ID YANG SUDAH MEMILIKI NASKAH
  const generatedTopikIds = new Set(items.map((n) => n.sumber_topik_id).filter(Boolean));

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

  async function fetchVisualList() {
    try {
      const res = await fetch("/api/visual");
      const json = await res.json();
      if (json.data) setVisualList(json.data);
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
    fetchVisualList();
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
    fetchVisualList();
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

  // Cek apakah naskah n sudah dibuatkan Visual Storyboard
  function checkHasVisual(naskah: Naskah): boolean {
    if (!Array.isArray(visualList) || visualList.length === 0) return false;

    return visualList.some((v) => {
      if (v.sumber_naskah_id && v.sumber_naskah_id === naskah.id) return true;
      const cleanNaskahJudul = cleanTitle(naskah.judul).toLowerCase();
      const cleanVisualJudul = cleanTitle(v.judul || "").toLowerCase();
      return cleanNaskahJudul.length > 3 && cleanVisualJudul.includes(cleanNaskahJudul);
    });
  }

  // Filter daftar naskah
  const filteredItems = items.filter((item) => {
    const hasVisual = checkHasVisual(item);
    if (filterStatus === "PROCESSED") return hasVisual;
    if (filterStatus === "UNPROCESSED") return !hasVisual;
    return true;
  });

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
                  {topikList.map((t) => {
                    const isGenerated = generatedTopikIds.has(t.id);
                    return (
                      <option key={t.id} value={t.id}>
                        {isGenerated ? `✓ ${cleanTitle(t.judul)}` : cleanTitle(t.judul)}
                      </option>
                    );
                  })}
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

      {/* Filter Status Cepat & Title */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
        <div className="section-title" style={{ margin: 0 }}>
          Daftar Script ({filteredItems.length} dari {items.length})
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
            Belum Visual
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
            Sudah Visual
          </button>
        </div>
      </div>

      {/* Script List */}
      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 90 }} />)}
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="glass-card-static" style={{ padding: 24, textAlign: "center", fontSize: 12, color: "var(--text-tertiary)" }}>
          {filterStatus === "UNPROCESSED"
            ? "Semua naskah sudah dibuatkan visual storyboard!"
            : filterStatus === "PROCESSED"
            ? "Belum ada naskah yang dibuatkan visual."
            : "Belum ada script tersimpan."}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {filteredItems.map((item) => {
            const isEditing = editingId === item.id;
            const hasVisual = checkHasVisual(item);

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
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                          {/* Indikator Bundar 🟢 / ⚪ */}
                          <span
                            title={hasVisual ? "Sudah diproses ke Visual" : "Belum diproses ke Visual"}
                            style={{
                              width: 10,
                              height: 10,
                              borderRadius: "50%",
                              background: hasVisual ? "#22c55e" : "#9ca3af",
                              boxShadow: hasVisual ? "0 0 8px rgba(34, 197, 94, 0.6)" : "none",
                              flexShrink: 0
                            }}
                          />
                          <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0, color: "var(--text-primary)" }}>
                            {cleanTitle(item.judul)}
                          </h3>
                        </div>

                        <div style={{ marginTop: 6, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                          <span className={`badge ${item.status === "approved" ? "badge-success" : item.status === "review" ? "badge-warning" : "badge-neutral"}`}>
                            {item.status === "approved" ? "✓ Terverifikasi" : item.status === "review" ? "Perlu Review" : "Draft"}
                          </span>
                          {item.english_script && <span className="badge badge-neutral">English</span>}

                          {/* Badge Visual Status */}
                          <span className="badge badge-neutral" style={{ fontSize: 10, display: "inline-flex", alignItems: "center", gap: 4 }}>
                            {hasVisual ? (
                              <span style={{ color: "#4ade80" }}>🟢 Sudah Ada Visual</span>
                            ) : (
                              <span style={{ color: "#9ca3af" }}>⚪ Belum Ada Visual</span>
                            )}
                          </span>
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
                        className={`btn btn-sm ${hasVisual ? "btn-secondary" : "btn-primary"}`}
                      >
                        {hasVisual ? "Lihat/Buat Visual Lagi" : "Buat Visual"}
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

      {/* Modal Translation View */}
      {activeModalItem && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(0,0,0,0.7)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000,
          padding: 16
        }}>
          <div className="glass-card-static" style={{ maxWidth: 600, width: "100%", maxHeight: "80vh", overflowY: "auto", padding: 22 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0, color: "var(--text-primary)" }}>
                English Script: {cleanTitle(activeModalItem.naskah.judul)}
              </h3>
              <button onClick={() => setActiveModalItem(null)} className="btn btn-ghost btn-sm">Tutup</button>
            </div>
            <div style={{
              background: "var(--bg-tertiary)",
              padding: 14,
              borderRadius: "var(--radius-md)",
              fontSize: 12,
              lineHeight: 1.6,
              color: "var(--text-primary)",
              whiteSpace: "pre-wrap"
            }}>
              {activeModalItem.naskah.english_script || "Script belum diterjemahkan."}
            </div>
            <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end", gap: 8 }}>
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
