"use client";

import { useState, useEffect } from "react";

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
      if (res.ok) setList((prev) => prev.filter((v) => v.id !== id));
    } catch (e) {
      // diamkan
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

  async function toggleStatus(v: VisualRow) {
    const newStatus = v.status === "draft" ? "siap_produksi" : "draft";
    try {
      const res = await fetch(`/api/visual/${v.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) await fetchList();
    } catch (e) {
      // diamkan
    }
  }

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: 24 }}>
      <h1 style={{ fontSize: 24, marginBottom: 16 }}>Menu Visual</h1>

      <form
        onSubmit={handleSubmit}
        style={{
          border: "1px solid #333",
          borderRadius: 8,
          padding: 16,
          marginBottom: 24,
        }}
      >
        <label style={{ display: "block", marginBottom: 8, fontSize: 14 }}>
          Judul panduan visual
        </label>
        <input
          type="text"
          value={judul}
          onChange={(e) => setJudul(e.target.value)}
          placeholder="Misal: Storyboard - Knocker-Up abad 19"
          disabled={submitting}
          style={{
            width: "100%",
            padding: 8,
            borderRadius: 6,
            border: "1px solid #444",
            background: "#111",
            color: "#fff",
            marginBottom: 12,
          }}
        />

        <label style={{ display: "block", marginBottom: 8, fontSize: 14 }}>
          Panduan visual / storyboard
        </label>
        <textarea
          value={isiVisual}
          onChange={(e) => setIsiVisual(e.target.value)}
          placeholder="Deskripsi visual, instruksi editing, storyboard..."
          disabled={submitting}
          rows={5}
          style={{
            width: "100%",
            padding: 8,
            borderRadius: 6,
            border: "1px solid #444",
            background: "#111",
            color: "#fff",
            marginBottom: 12,
            fontFamily: "inherit",
          }}
        />

        {formError && (
          <div style={{ color: "#f88", fontSize: 13, marginBottom: 12 }}>
            {formError}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          style={{
            padding: "8px 16px",
            borderRadius: 6,
            border: "1px solid #666",
            background: submitting ? "#333" : "#1a1a1a",
            color: "#fff",
            cursor: submitting ? "not-allowed" : "pointer",
          }}
        >
          {submitting ? "Menyimpan..." : "Tambah Panduan Visual"}
        </button>
      </form>

      <h2 style={{ fontSize: 18, marginBottom: 12 }}>Daftar Panduan Visual</h2>

      {loading && <p style={{ color: "#888" }}>Memuat data...</p>}

      {!loading && list.length === 0 && (
        <p style={{ color: "#888" }}>Belum ada panduan visual tersimpan.</p>
      )}

      {list.map((v) => (
        <div
          key={v.id}
          style={{
            border: "1px solid #333",
            borderRadius: 8,
            padding: 16,
            marginBottom: 12,
          }}
        >
          {editingId === v.id ? (
            <div>
              <input
                type="text"
                value={editJudul}
                onChange={(e) => setEditJudul(e.target.value)}
                style={{
                  width: "100%",
                  padding: 8,
                  borderRadius: 6,
                  border: "1px solid #444",
                  background: "#111",
                  color: "#fff",
                  marginBottom: 8,
                }}
              />
              <textarea
                value={editIsi}
                onChange={(e) => setEditIsi(e.target.value)}
                rows={4}
                style={{
                  width: "100%",
                  padding: 8,
                  borderRadius: 6,
                  border: "1px solid #444",
                  background: "#111",
                  color: "#fff",
                  marginBottom: 8,
                  fontFamily: "inherit",
                }}
              />
              <button
                onClick={() => saveEdit(v.id)}
                style={{
                  marginRight: 8,
                  padding: "6px 12px",
                  borderRadius: 6,
                  border: "1px solid #6f6",
                  background: "none",
                  color: "#6f6",
                  cursor: "pointer",
                  fontSize: 13,
                }}
              >
                Simpan
              </button>
              <button
                onClick={cancelEdit}
                style={{
                  padding: "6px 12px",
                  borderRadius: 6,
                  border: "1px solid #666",
                  background: "none",
                  color: "#aaa",
                  cursor: "pointer",
                  fontSize: 13,
                }}
              >
                Batal
              </button>
            </div>
          ) : (
            <>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                }}
              >
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>{v.judul}</div>
                  {v.isi_visual && (
                    <div
                      style={{
                        fontSize: 13,
                        color: "#aaa",
                        marginTop: 4,
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      {v.isi_visual}
                    </div>
                  )}
                  <div style={{ fontSize: 12, color: "#666", marginTop: 6 }}>
                    Status:{" "}
                    {v.status === "siap_produksi" ? "Siap Produksi" : "Draft"}
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(v.id)}
                  style={{
                    background: "none",
                    border: "1px solid #555",
                    borderRadius: 6,
                    color: "#f88",
                    padding: "4px 10px",
                    cursor: "pointer",
                    fontSize: 12,
                    flexShrink: 0,
                    marginLeft: 8,
                  }}
                >
                  Hapus
                </button>
              </div>

              <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
                <button
                  onClick={() => startEdit(v)}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 6,
                    border: "1px solid #6cf",
                    background: "none",
                    color: "#6cf",
                    cursor: "pointer",
                    fontSize: 13,
                  }}
                >
                  Edit
                </button>
                <button
                  onClick={() => toggleStatus(v)}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 6,
                    border: "1px solid #fc6",
                    background: "none",
                    color: "#fc6",
                    cursor: "pointer",
                    fontSize: 13,
                  }}
                >
                  Tandai {v.status === "draft" ? "Siap Produksi" : "Draft"}
                </button>
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}