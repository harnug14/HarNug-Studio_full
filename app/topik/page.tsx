"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

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
      setMessage("Gagal menyimpan: " + json.error);
    } else {
      setJudul("");
      setCatatan("");
      setMessage("Topik berhasil disimpan");
      fetchTopik();
    }
    setSubmitting(false);
  }

  async function handleDelete(id: string) {
    const confirmed = confirm("Yakin mau hapus topik ini?");
    if (!confirmed) return;

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
    <main style={{ maxWidth: 700, margin: "0 auto", padding: 24 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 16 }}>
        Menu Topik
      </h1>

      <form onSubmit={handleAdd} style={{ marginBottom: 32, display: "flex", flexDirection: "column", gap: 8 }}>
        <input
          type="text"
          placeholder="Judul topik"
          value={judul}
          onChange={(e) => setJudul(e.target.value)}
          required
          style={{ padding: 8 }}
        />

        <textarea
          placeholder="Catatan (opsional)"
          value={catatan}
          onChange={(e) => setCatatan(e.target.value)}
          rows={3}
          style={{ padding: 8 }}
        />

        <button type="submit" disabled={submitting} style={{ padding: 10, cursor: "pointer" }}>
          {submitting ? "Menyimpan..." : "Tambah Topik"}
        </button>

        {message && <p>{message}</p>}
      </form>

      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>Daftar Topik</h2>
      <p style={{ fontSize: 13, opacity: 0.6, marginBottom: 12 }}>
        Klik judul topik untuk membuat naskah dari topik itu di AI Chat.
      </p>

      {loading ? (
        <p>Memuat...</p>
      ) : items.length === 0 ? (
        <p>Belum ada topik tersimpan.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {items.map((item) => {
            const isEditing = editingId === item.id;

            return (
              <div
                key={item.id}
                style={{
                  border: "1px solid #333",
                  borderRadius: 8,
                  padding: 12,
                }}
              >
                {isEditing ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <input
                      type="text"
                      value={editJudul}
                      onChange={(e) => setEditJudul(e.target.value)}
                      style={{ padding: 8 }}
                    />
                    <textarea
                      value={editCatatan}
                      onChange={(e) => setEditCatatan(e.target.value)}
                      rows={3}
                      style={{ padding: 8 }}
                    />
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        onClick={() => handleSaveEdit(item.id)}
                        style={{ padding: "6px 12px", cursor: "pointer" }}
                      >
                        Simpan
                      </button>
                      <button
                        onClick={cancelEdit}
                        style={{ padding: "6px 12px", cursor: "pointer" }}
                      >
                        Batal
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div
                      onClick={() => handleBuatNaskah(item.id)}
                      style={{ fontWeight: 600, cursor: "pointer", textDecoration: "underline" }}
                      title="Klik untuk buat naskah dari topik ini"
                    >
                      {item.judul}
                    </div>
                    {item.catatan && (
                      <div style={{ fontSize: 14, opacity: 0.8, marginTop: 4 }}>
                        {item.catatan}
                      </div>
                    )}
                    <div style={{ fontSize: 12, opacity: 0.5, marginTop: 4 }}>
                      Status: {item.status}
                    </div>
                    <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                      <button
                        onClick={() => startEdit(item)}
                        style={{ padding: "6px 12px", cursor: "pointer" }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(item.id)}
                        style={{ padding: "6px 12px", cursor: "pointer" }}
                      >
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
    </main>
  );
}