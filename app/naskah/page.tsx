"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import DashboardLayout from "../components/DashboardLayout";

type Naskah = {
  id: string;
  judul: string;
  isi_naskah: string | null;
  sumber_topik_id: string | null;
  status: string;
  created_at: string;
};

export default function NaskahPage() {
  const router = useRouter();
  const [items, setItems] = useState<Naskah[]>([]);
  const [loading, setLoading] = useState(true);

  const [judul, setJudul] = useState("");
  const [isiNaskah, setIsiNaskah] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editJudul, setEditJudul] = useState("");
  const [editIsi, setEditIsi] = useState("");

  const [expandedId, setExpandedId] = useState<string | null>(null);

  async function fetchNaskah() {
    setLoading(true);
    const res = await fetch("/api/naskah");
    const json = await res.json();
    if (json.data) setItems(json.data);
    setLoading(false);
  }

  useEffect(() => {
    fetchNaskah();
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setMessage("");

    const res = await fetch("/api/naskah", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ judul, isiNaskah }),
    });
    const json = await res.json();

    if (json.error) {
      setMessage("error:" + json.error);
    } else {
      setJudul("");
      setIsiNaskah("");
      setMessage("success:Naskah berhasil disimpan");
      fetchNaskah();
    }
    setSubmitting(false);
  }

  async function handleDelete(id: string) {
    if (!confirm("Yakin mau hapus naskah ini?")) return;
    try {
      const res = await fetch(`/api/naskah/${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        fetchNaskah();
      } else {
        alert("Gagal menghapus: " + (data.error || `Status ${res.status}`));
      }
    } catch (err: any) {
      alert("Gagal menghapus: " + (err.message || "Terjadi kesalahan jaringan"));
    }
  }

  function startEdit(item: Naskah) {
    setEditingId(item.id);
    setEditJudul(item.judul);
    setEditIsi(item.isi_naskah || "");
  }

  function cancelEdit() {
    setEditingId(null);
    setEditJudul("");
    setEditIsi("");
  }

  async function handleSaveEdit(id: string) {
    await fetch(`/api/naskah/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ judul: editJudul, isiNaskah: editIsi }),
    });
    cancelEdit();
    fetchNaskah();
  }

  function handleBuatVisual(id: string) {
    router.push(`/ai-chat?fromNaskah=${id}`);
  }

  return (
    <DashboardLayout>
      <div className="animate-fade-in">
        <div className="page-header" style={{ marginBottom: 24 }}>
          <h1 className="page-title">Script</h1>
          <p className="page-subtitle">
            Tulis dan kelola naskah video YouTube Shorts. Klik judul untuk membuat panduan visual via AI.
          </p>
        </div>

        {/* Add Form */}
        <div className="glass-card-static" style={{ padding: 24, marginBottom: 32 }}>
          <form onSubmit={handleAdd}>
            <div style={{ marginBottom: 16 }}>
              <label className="form-label">Judul naskah</label>
              <input
                type="text"
                placeholder="Contoh: Naskah - Fakta menarik ..."
                value={judul}
                onChange={(e) => setJudul(e.target.value)}
                required
                className="input-field"
              />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label className="form-label">Isi naskah (opsional)</label>
              <textarea
                placeholder="Isi naskah video (bisa diisi belakangan)..."
                value={isiNaskah}
                onChange={(e) => setIsiNaskah(e.target.value)}
                rows={6}
                className="textarea-field"
              />
            </div>

            <button type="submit" disabled={submitting} className="btn btn-primary">
              {submitting ? (
                <><span className="spinner" />Menyimpan...</>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                  Tambah Naskah
                </>
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

        {/* List */}
        <div className="section-title">Daftar Naskah</div>

        {loading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {[1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 80 }} />)}
          </div>
        ) : items.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <path d="M14 2v6h6" />
              </svg>
            </div>
            <div className="empty-state-text">Belum ada naskah tersimpan.</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {items.map((item) => {
              const isEditing = editingId === item.id;
              const isExpanded = expandedId === item.id;

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
                        value={editIsi}
                        onChange={(e) => setEditIsi(e.target.value)}
                        rows={8}
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
                            onClick={() => handleBuatVisual(item.id)}
                            style={{
                              fontWeight: 600,
                              cursor: "pointer",
                              fontSize: 15,
                              color: "var(--text-primary)",
                              transition: "color var(--transition-fast)",
                            }}
                            title="Klik untuk buat panduan visual dari naskah ini"
                            onMouseEnter={(e) => e.currentTarget.style.color = "var(--accent-primary)"}
                            onMouseLeave={(e) => e.currentTarget.style.color = "var(--text-primary)"}
                          >
                            {item.judul}
                          </div>
                          {item.isi_naskah && (
                            <div
                              style={{
                                fontSize: 13,
                                color: "var(--text-secondary)",
                                marginTop: 8,
                                lineHeight: 1.6,
                                whiteSpace: "pre-wrap",
                                maxHeight: isExpanded ? "none" : 80,
                                overflow: "hidden",
                                position: "relative",
                              }}
                            >
                              {item.isi_naskah}
                              {!isExpanded && item.isi_naskah.length > 200 && (
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
                          {item.isi_naskah && item.isi_naskah.length > 200 && (
                            <button
                              onClick={() => setExpandedId(isExpanded ? null : item.id)}
                              className="btn btn-ghost btn-sm"
                              style={{ marginTop: 4, padding: "4px 0", color: "var(--accent-primary)", fontSize: 12 }}
                            >
                              {isExpanded ? "Sembunyikan" : "Lihat selengkapnya"}
                            </button>
                          )}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                        <button onClick={() => startEdit(item)} className="btn btn-ghost btn-sm">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" /></svg>
                          Edit
                        </button>
                        <button onClick={() => handleBuatVisual(item.id)} className="btn btn-ghost btn-sm" style={{ color: "var(--accent-primary)" }}>
                          ✨ Buat Visual
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