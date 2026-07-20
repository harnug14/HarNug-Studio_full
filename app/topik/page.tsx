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

export default function TopikPage() {
  const router = useRouter();
  const [items, setItems] = useState<Topik[]>([]);
  const [loading, setLoading] = useState(true);

  const [judul, setJudul] = useState("");
  const [catatan, setCatatan] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editJudul, setEditJudul] = useState("");
  const [editCatatan, setEditCatatan] = useState("");

  async function fetchTopik() {
    setLoading(true);
    const res = await fetch("/api/topik");
    const json = await res.json();
    if (json.data) setItems(json.data);
    setLoading(false);
  }

  useEffect(() => {
    fetchTopik();
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

  function handleBuatNaskah(id: string) {
    router.push(`/ai-chat?fromTopik=${id}`);
  }

  return (
    <DashboardLayout>
      <div className="animate-fade-in">
        <div className="page-header">
          <h1 className="page-title">Topik</h1>
          <p className="page-subtitle">
            Kelola ide topik video YouTube Shorts Anda. Klik judul topik untuk membuat naskah via AI.
          </p>
        </div>

        {/* Add Form */}
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
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                  Tambah Topik
                </>
              )}
            </button>

            {message && (
              <div style={{
                marginTop: 12,
                padding: "10px 14px",
                borderRadius: "var(--radius-md)",
                fontSize: 13,
                background: message.startsWith("error:") ? "rgba(239, 68, 68, 0.1)" : "rgba(34, 197, 94, 0.1)",
                border: `1px solid ${message.startsWith("error:") ? "rgba(239, 68, 68, 0.2)" : "rgba(34, 197, 94, 0.2)"}`,
                color: message.startsWith("error:") ? "#fca5a5" : "#86efac",
              }}>
                {message.replace(/^(error:|success:)/, "")}
              </div>
            )}
          </form>
        </div>

        {/* List */}
        <div className="section-title">Daftar Topik</div>

        {loading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {[1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 80 }} />)}
          </div>
        ) : items.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 1 1 7.072 0l-.548.547A3.374 3.374 0 0 0 14 18.469V19a2 2 0 1 1-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <div className="empty-state-text">Belum ada topik tersimpan.</div>
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
                            onClick={() => handleBuatNaskah(item.id)}
                            style={{
                              fontWeight: 600,
                              cursor: "pointer",
                              fontSize: 15,
                              color: "var(--text-primary)",
                              transition: "color var(--transition-fast)",
                            }}
                            title="Klik untuk buat naskah dari topik ini"
                            onMouseEnter={(e) => e.currentTarget.style.color = "var(--accent-cyan)"}
                            onMouseLeave={(e) => e.currentTarget.style.color = "var(--text-primary)"}
                          >
                            {item.judul}
                          </div>
                          {item.catatan && (
                            <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 6, lineHeight: 1.5 }}>
                              {item.catatan}
                            </div>
                          )}
                          <div style={{ marginTop: 8 }}>
                            <span className="badge badge-neutral">{item.status}</span>
                          </div>
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                        <button onClick={() => startEdit(item)} className="btn btn-ghost btn-sm">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" /></svg>
                          Edit
                        </button>
                        <button onClick={() => handleBuatNaskah(item.id)} className="btn btn-ghost btn-sm" style={{ color: "var(--accent-cyan)" }}>
                          ✨ Buat Naskah
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