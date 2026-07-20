"use client";

import { useState, useEffect } from "react";
import DashboardLayout from "../components/DashboardLayout";

interface VisualRow {
  id: string;
  judul: string;
  isi_visual: string | null;
  status: string;
  created_at: string;
}

export default function VisualPage() {
  const [list, setList] = useState<VisualRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [judul, setJudul] = useState("");
  const [isiVisual, setIsiVisual] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editJudul, setEditJudul] = useState("");
  const [editIsi, setEditIsi] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    fetchList();
  }, []);

  async function fetchList() {
    setLoading(true);
    try {
      const res = await fetch("/api/visual");
      const data = await res.json();
      if (res.ok) setList(data.data || []);
    } catch (e) {
      // diamkan
    }
    setLoading(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");

    if (!judul.trim()) {
      setFormError("Judul panduan visual wajib diisi");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/visual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ judul, isi_visual: isiVisual }),
      });
      const data = await res.json();

      if (!res.ok) {
        setFormError(data.error || "Gagal menyimpan panduan visual");
      } else {
        setJudul("");
        setIsiVisual("");
        await fetchList();
      }
    } catch (err: any) {
      setFormError(err.message || "Terjadi kesalahan");
    }
    setSubmitting(false);
  }

  async function handleDelete(id: string) {
    if (!confirm("Hapus panduan visual ini?")) return;
    try {
      const res = await fetch(`/api/visual/${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setList((prev) => prev.filter((v) => v.id !== id));
      } else {
        alert("Gagal menghapus: " + (data.error || `Status ${res.status}`));
      }
    } catch (err: any) {
      alert("Gagal menghapus: " + (err.message || "Terjadi kesalahan jaringan"));
    }
  }

  function startEdit(v: VisualRow) {
    setEditingId(v.id);
    setEditJudul(v.judul);
    setEditIsi(v.isi_visual || "");
  }

  function cancelEdit() {
    setEditingId(null);
    setEditJudul("");
    setEditIsi("");
  }

  async function saveEdit(id: string) {
    try {
      const res = await fetch(`/api/visual/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ judul: editJudul, isi_visual: editIsi }),
      });
      if (res.ok) {
        setEditingId(null);
        await fetchList();
      }
    } catch (e) {
      // diamkan
    }
  }

  return (
    <DashboardLayout>
      <div className="animate-fade-in">
        <div className="page-header">
          <h1 className="page-title">Visual</h1>
          <p className="page-subtitle">
            Buat dan kelola panduan visual, storyboard, serta instruksi editing untuk video Anda.
          </p>
        </div>

        {/* Add Form */}
        <div className="glass-card-static" style={{ padding: 24, marginBottom: 32 }}>
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 16 }}>
              <label className="form-label">Judul panduan visual</label>
              <input
                type="text"
                value={judul}
                onChange={(e) => setJudul(e.target.value)}
                placeholder="Misal: Storyboard - Knocker-Up abad 19"
                disabled={submitting}
                className="input-field"
              />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label className="form-label">Panduan visual / storyboard</label>
              <textarea
                value={isiVisual}
                onChange={(e) => setIsiVisual(e.target.value)}
                placeholder="Deskripsi visual, instruksi editing, storyboard..."
                disabled={submitting}
                rows={5}
                className="textarea-field"
              />
            </div>

            {formError && (
              <div style={{
                padding: "10px 14px",
                borderRadius: "var(--radius-md)",
                background: "var(--glass-bg)",
                border: "1px solid var(--status-error)",
                color: "var(--status-error)",
                fontSize: 13,
                marginBottom: 16,
              }}>
                {formError}
              </div>
            )}

            <button type="submit" disabled={submitting} className="btn btn-primary">
              {submitting ? (
                <><span className="spinner" />Menyimpan...</>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                  Tambah Panduan Visual
                </>
              )}
            </button>
          </form>
        </div>

        {/* List */}
        <div className="section-title">Daftar Panduan Visual</div>

        {loading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {[1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 100 }} />)}
          </div>
        ) : list.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" />
                <line x1="7" y1="2" x2="7" y2="22" />
                <line x1="17" y1="2" x2="17" y2="22" />
                <line x1="2" y1="12" x2="22" y2="12" />
              </svg>
            </div>
            <div className="empty-state-text">Belum ada panduan visual tersimpan.</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {list.map((v) => {
              const isEditing = editingId === v.id;
              const isExpanded = expandedId === v.id;

              return (
                <div key={v.id} className="glass-card-static" style={{ padding: 20 }}>
                  {isEditing ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      <input
                        type="text"
                        value={editJudul}
                        onChange={(e) => setEditJudul(e.target.value)}
                        className="input-field"
                      />
                      <textarea
                        value={editIsi}
                        onChange={(e) => setEditIsi(e.target.value)}
                        rows={6}
                        className="textarea-field"
                      />
                      <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={() => saveEdit(v.id)} className="btn btn-primary btn-sm">Simpan</button>
                        <button onClick={cancelEdit} className="btn btn-ghost btn-sm">Batal</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)" }}>
                            {v.judul}
                          </div>
                          {v.isi_visual && (
                            <div
                              style={{
                                fontSize: 13,
                                color: "var(--text-secondary)",
                                marginTop: 8,
                                lineHeight: 1.6,
                                whiteSpace: "pre-wrap",
                                maxHeight: isExpanded ? "none" : 100,
                                overflow: "hidden",
                                position: "relative",
                              }}
                            >
                              {v.isi_visual}
                              {!isExpanded && v.isi_visual.length > 250 && (
                                <div style={{
                                  position: "absolute",
                                  bottom: 0,
                                  left: 0,
                                  right: 0,
                                  height: 40,
                                  background: "linear-gradient(var(--bg-elevated-transparent), var(--bg-elevated))",
                                }} />
                              )}
                            </div>
                          )}
                          {v.isi_visual && v.isi_visual.length > 250 && (
                            <button
                              onClick={() => setExpandedId(isExpanded ? null : v.id)}
                              className="btn btn-ghost btn-sm"
                              style={{ marginTop: 4, padding: "4px 0", color: "var(--accent-primary)", fontSize: 12 }}
                            >
                              {isExpanded ? "Sembunyikan" : "Lihat selengkapnya"}
                            </button>
                          )}
                        </div>
                      </div>

                      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                        <button onClick={() => startEdit(v)} className="btn btn-ghost btn-sm">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" /></svg>
                          Edit
                        </button>
                        <button onClick={() => handleDelete(v.id)} className="btn btn-danger btn-sm">
                          Hapus
                        </button>
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