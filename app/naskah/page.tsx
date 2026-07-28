"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import DashboardLayout from "../components/DashboardLayout";

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

function NaskahContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryTopikId = searchParams.get("topikId");
  const queryJudul = searchParams.get("judul");

  const [items, setItems] = useState<Naskah[]>([]);
  const [topikList, setTopikList] = useState<Topik[]>([]);
  const [channelProfiles, setChannelProfiles] = useState<ChannelProfile[]>([]);
  const [loading, setLoading] = useState(true);

  // Tab & Generator state
  const [activeTab, setActiveTab] = useState<"generator" | "manual">("generator");
  const [selectedTopikId, setSelectedTopikId] = useState(queryTopikId || "");
  const [judulTopik, setJudulTopik] = useState(queryJudul || "");
  const [catatanTopik, setCatatanTopik] = useState("");
  const [tone, setTone] = useState("Natural & Antusias");
  const [targetPanjang, setTargetPanjang] = useState("45-60 detik (130-160 kata)");
  const [referenceProfileId, setReferenceProfileId] = useState("");

  const isManualMode = !referenceProfileId;

  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState("");

  // Manual Add State
  const [manualJudul, setManualJudul] = useState("");
  const [manualIsi, setManualIsi] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  // Edit State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editJudul, setEditJudul] = useState("");
  const [editIsi, setEditIsi] = useState("");
  const [editEnglishIsi, setEditEnglishIsi] = useState("");

  // Modal / Detail state
  const [factCheckLoading, setFactCheckLoading] = useState<string | null>(null);
  const [translateLoading, setTranslateLoading] = useState<string | null>(null);
  const [activeModalItem, setActiveModalItem] = useState<{ naskah: Naskah; type: "fact-check" | "translation" } | null>(null);

  async function fetchNaskah() {
    setLoading(true);
    const res = await fetch("/api/naskah");
    const json = await res.json();
    if (json.data) setItems(json.data);
    setLoading(false);
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
    if (queryTopikId && queryJudul) {
      setSelectedTopikId(queryTopikId);
      setJudulTopik(queryJudul);
    }
  }, [queryTopikId, queryJudul]);

  function handleSelectTopik(id: string) {
    setSelectedTopikId(id);
    const t = topikList.find((x) => x.id === id);
    if (t) {
      setJudulTopik(t.judul);
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
          judulTopik,
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
        // Clear fields
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
      body: JSON.stringify({ judul: manualJudul, isiNaskah: manualIsi }),
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

  async function handleRunFactCheck(naskahId: string) {
    setFactCheckLoading(naskahId);
    try {
      const res = await fetch(`/api/naskah/${naskahId}/fact-check`, { method: "POST" });
      const json = await res.json();
      if (json.error) {
        alert("Fact Check error: " + json.error);
      } else {
        fetchNaskah();
        if (json.data) {
          setActiveModalItem({ naskah: json.data, type: "fact-check" });
        }
      }
    } catch (err: any) {
      alert("Fact Check gagal: " + err.message);
    } finally {
      setFactCheckLoading(null);
    }
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

  async function handleApproveVerified(naskahId: string) {
    await fetch(`/api/naskah/${naskahId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "approved" }),
    });
    setActiveModalItem(null);
    fetchNaskah();
  }

  async function handleDelete(id: string) {
    if (!confirm("Yakin mau hapus naskah ini?")) return;
    await fetch(`/api/naskah/${id}`, { method: "DELETE" });
    fetchNaskah();
  }

  function startEdit(item: Naskah) {
    setEditingId(item.id);
    setEditJudul(item.judul);
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
        judul: editJudul,
        isiNaskah: editIsi,
        englishScript: editEnglishIsi,
      }),
    });
    cancelEdit();
    fetchNaskah();
  }

  function handleBuatVisual(item: Naskah) {
    router.push(`/visual?naskahId=${item.id}&judul=${encodeURIComponent(item.judul)}`);
  }

  return (
    <DashboardLayout>
      <div className="animate-fade-in">
        <div className="page-header" style={{ marginBottom: 24 }}>
          <h1 className="page-title">Script Draft & Fact Check</h1>
          <p className="page-subtitle">
            Susun naskah utuh YouTube Shorts dengan struktur linear, lakukan verifikasi konsistensi internal, dan terjemahkan ke bahasa Inggris.
          </p>
        </div>

        {/* Tab Selection */}
        <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
          <button
            onClick={() => setActiveTab("generator")}
            className={`btn ${activeTab === "generator" ? "btn-primary" : "btn-ghost"}`}
          >
            ✨ Workflow AI Script Generator
          </button>
          <button
            onClick={() => setActiveTab("manual")}
            className={`btn ${activeTab === "manual" ? "btn-primary" : "btn-ghost"}`}
          >
            ➕ Input Manual
          </button>
        </div>

        {/* AI Script Generator Workflow */}
        {activeTab === "generator" && (
          <div className="glass-card-static" style={{ padding: 24, marginBottom: 32 }}>
            <form onSubmit={handleGenerateScript}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16, marginBottom: 16 }}>
                <div>
                  <label className="form-label">Pilih dari Topic Bank (Opsional)</label>
                  <select
                    value={selectedTopikId}
                    onChange={(e) => handleSelectTopik(e.target.value)}
                    className="select-field"
                  >
                    <option value="">-- Buat Naskah dari Topik Baru / Manual --</option>
                    {topikList.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.judul}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="form-label">Judul Topik Video *</label>
                  <input
                    type="text"
                    placeholder="Contoh: Mengapa High Heels Dulu Dibuat untuk Pria?"
                    value={judulTopik}
                    onChange={(e) => setJudulTopik(e.target.value)}
                    required
                    className="input-field"
                  />
                </div>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label className="form-label">Catatan / Konteks Topik (Opsional)</label>
                <textarea
                  placeholder="Detail fakta khusus atau arah pembahasan yang ingin ditekankan..."
                  value={catatanTopik}
                  onChange={(e) => setCatatanTopik(e.target.value)}
                  rows={2}
                  className="textarea-field"
                />
              </div>

              {/* Channel Profile Selection */}
              <div style={{ marginBottom: 20 }}>
                <label className="form-label">Referensi Kalibrasi Naskah (Opsional)</label>
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

              {/* Show Manual Parameters ONLY when Tanpa Referensi is selected */}
              {isManualMode && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16, marginBottom: 20 }}>
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
                    <label className="form-label">Target Panjang / Durasi</label>
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

              <button type="submit" disabled={generating} className="btn btn-primary" style={{ width: "100%", justifyContent: "center" }}>
                {generating ? (
                  <><span className="spinner" />Menyusun Script Draft (Hook → Timeline → Ending)...</>
                ) : (
                  <>🚀 Generate Script Draft</>
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

        {/* Manual Add Form */}
        {activeTab === "manual" && (
          <div className="glass-card-static" style={{ padding: 24, marginBottom: 32 }}>
            <form onSubmit={handleManualAdd}>
              <div style={{ marginBottom: 16 }}>
                <label className="form-label">Judul naskah</label>
                <input
                  type="text"
                  placeholder="Contoh: Naskah - Fakta menarik ..."
                  value={manualJudul}
                  onChange={(e) => setManualJudul(e.target.value)}
                  required
                  className="input-field"
                />
              </div>

              <div style={{ marginBottom: 20 }}>
                <label className="form-label">Isi naskah</label>
                <textarea
                  placeholder="Isi naskah video..."
                  value={manualIsi}
                  onChange={(e) => setManualIsi(e.target.value)}
                  rows={6}
                  className="textarea-field"
                />
              </div>

              <button type="submit" disabled={submitting} className="btn btn-primary">
                {submitting ? <><span className="spinner" />Menyimpan...</> : <>➕ Tambah Naskah Manual</>}
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

        {/* Script List */}
        <div className="section-title">Daftar Script Draft & Verified ({items.length})</div>

        {loading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {[1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 100 }} />)}
          </div>
        ) : items.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📜</div>
            <div className="empty-state-text">Belum ada script tersimpan.</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {items.map((item) => {
              const isEditing = editingId === item.id;
              const hasEnglish = !!item.english_script;
              const hasFactCheck = !!item.fact_check_result;

              return (
                <div key={item.id} className="glass-card-static" style={{ padding: 20 }}>
                  {isEditing ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
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
                          rows={6}
                          className="textarea-field"
                        />
                      </div>
                      <div>
                        <label className="form-label">Naskah (English)</label>
                        <textarea
                          value={editEnglishIsi}
                          onChange={(e) => setEditEnglishIsi(e.target.value)}
                          rows={6}
                          className="textarea-field"
                          placeholder="Terjemahan bahasa Inggris..."
                        />
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={() => handleSaveEdit(item.id)} className="btn btn-primary btn-sm">Simpan Edit</button>
                        <button onClick={cancelEdit} className="btn btn-ghost btn-sm">Batal</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 12 }}>
                        <div>
                          <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)" }}>{item.judul}</h3>
                          <div style={{ marginTop: 6, display: "flex", gap: 8, alignItems: "center" }}>
                            <span className={`badge ${item.status === "approved" ? "badge-success" : item.status === "review" ? "badge-warning" : "badge-neutral"}`}>
                              {item.status === "approved" ? "✓ Verified Script" : item.status === "review" ? "🔍 Needs Review" : "Draft"}
                            </span>
                            {hasEnglish && <span className="badge badge-accent">🇺🇸 English Ready</span>}
                            {hasFactCheck && <span className="badge badge-neutral">🔍 Fact-Checked</span>}
                          </div>
                        </div>
                      </div>

                      {/* Script Preview */}
                      <div style={{
                        background: "rgba(0, 0, 0, 0.2)",
                        padding: 14,
                        borderRadius: "var(--radius-md)",
                        fontSize: 13,
                        lineHeight: 1.6,
                        color: "var(--text-secondary)",
                        whiteSpace: "pre-wrap",
                        maxHeight: 180,
                        overflowY: "auto",
                        marginBottom: 16,
                      }}>
                        {item.isi_naskah || "(Kosong)"}
                      </div>

                      {/* Action buttons toolbar */}
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                        <button
                          onClick={() => handleRunFactCheck(item.id)}
                          disabled={factCheckLoading === item.id}
                          className="btn btn-ghost btn-sm"
                          style={{ color: "var(--accent-primary)" }}
                        >
                          {factCheckLoading === item.id ? <span className="spinner" /> : "🔍 Fact Check"}
                        </button>

                        <button
                          onClick={() => handleRunTranslation(item.id)}
                          disabled={translateLoading === item.id}
                          className="btn btn-ghost btn-sm"
                          style={{ color: "var(--accent-primary)" }}
                        >
                          {translateLoading === item.id ? <span className="spinner" /> : "🌐 Translate to EN"}
                        </button>

                        {item.fact_check_result && (
                          <button
                            onClick={() => setActiveModalItem({ naskah: item, type: "fact-check" })}
                            className="btn btn-ghost btn-sm"
                          >
                            📋 Lihat Fact Check Report
                          </button>
                        )}

                        {hasEnglish && (
                          <button
                            onClick={() => setActiveModalItem({ naskah: item, type: "translation" })}
                            className="btn btn-ghost btn-sm"
                          >
                            🇺🇸 Lihat English Script
                          </button>
                        )}

                        <button onClick={() => startEdit(item)} className="btn btn-ghost btn-sm">Edit</button>

                        <button
                          onClick={() => handleBuatVisual(item)}
                          className="btn btn-primary btn-sm"
                          style={{ marginLeft: "auto" }}
                        >
                          🎨 Visual Framework (V1.0) →
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

        {/* Fact Check / Translation Modal */}
        {activeModalItem && (
          <div style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.75)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
            padding: 20,
          }}>
            <div className="glass-card-static" style={{ width: "100%", maxWidth: 640, maxHeight: "85vh", overflowY: "auto", padding: 24 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <h3 style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)" }}>
                  {activeModalItem.type === "fact-check" ? "🔍 Fact Check Report" : "🇺🇸 English Script Version"}
                </h3>
                <button onClick={() => setActiveModalItem(null)} className="btn btn-ghost btn-sm">✕ Tutup</button>
              </div>

              {activeModalItem.type === "fact-check" && (
                <div>
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
                      Status Verifikasi: <span style={{ color: activeModalItem.naskah.fact_check_result?.statusVerification === "Konsisten" ? "var(--status-success)" : "var(--status-error)" }}>
                        {activeModalItem.naskah.fact_check_result?.statusVerification || "Perlu Review"}
                      </span>
                    </div>
                    <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                      Skor Konsistensi Internal: {activeModalItem.naskah.fact_check_result?.internalConsistencyScore || 85}/100
                    </div>
                  </div>

                  <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 16, lineHeight: 1.5 }}>
                    {activeModalItem.naskah.fact_check_result?.ringkasanEvaluasi}
                  </p>

                  {/* Factual Claims list */}
                  {activeModalItem.naskah.fact_check_result?.factualClaims?.length > 0 && (
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Ekstraksi Klaim Faktual:</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {activeModalItem.naskah.fact_check_result.factualClaims.map((fc: any, i: number) => (
                          <div key={i} style={{ background: "rgba(255,255,255,0.03)", padding: 10, borderRadius: 6, fontSize: 12 }}>
                            <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>• {fc.klaim}</div>
                            <div style={{ color: fc.status === "Konsisten" ? "var(--status-success)" : "var(--status-error)", marginTop: 2 }}>
                              Status: {fc.status} ({fc.catatan})
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
                    <button
                      onClick={() => handleApproveVerified(activeModalItem.naskah.id)}
                      className="btn btn-primary btn-sm"
                      style={{ flex: 1, justifyContent: "center" }}
                    >
                      ✓ Approve as Verified Script
                    </button>
                  </div>
                </div>
              )}

              {activeModalItem.type === "translation" && (
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 8 }}>
                    Native American English Voiceover Version:
                  </div>
                  <div style={{
                    background: "rgba(0, 0, 0, 0.3)",
                    padding: 16,
                    borderRadius: "var(--radius-md)",
                    fontSize: 14,
                    lineHeight: 1.6,
                    whiteSpace: "pre-wrap",
                    marginBottom: 16,
                  }}>
                    {activeModalItem.naskah.english_script}
                  </div>

                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(activeModalItem.naskah.english_script || "");
                      alert("English Script disalin ke clipboard!");
                    }}
                    className="btn btn-primary btn-sm"
                  >
                    📋 Salin English Script
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

export default function NaskahPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#050505" }}>
        <div className="spinner" style={{ width: 28, height: 28 }} />
      </div>
    }>
      <NaskahContent />
    </Suspense>
  );
}