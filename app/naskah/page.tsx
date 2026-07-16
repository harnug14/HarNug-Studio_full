"use client";

import { useEffect, useState } from "react";

type Naskah = {
  id: string;
  judul: string;
  isi_naskah: string | null;
  sumber_topik_id: string | null;
  status: string;
  created_at: string;
};

export default function NaskahPage() {
  const [items, setItems] = useState<Naskah[]>([]);
  const [loading, setLoading] = useState(true);

  const [judul, setJudul] = useState("");
  const [isiNaskah, setIsiNaskah] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editJudul, setEditJudul] = useState("");
  const [editIsi, setEditIsi] = useState("");

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
      setMessage("Gagal menyimpan: " + json.error);
    } else {
      setJudul("");
      setIsiNaskah("");
      setMessage("Naskah berhasil disimpan");
      fetchNaskah();
    }
    setSubmitting(false);
  }

  async function handleDelete(id: string) {
    const confirmed = confirm("Yakin mau hapus naskah ini?");
    if (!confirmed) return;

    await fetch(`/api/naskah/${id}`, { method: "DELETE" });
    fetchNaskah();
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

  async function handleToggleStatus(item: Naskah) {
    const newStatus = item.status === "draft" ? "disetujui" : "draft";
    await fetch(`/api/naskah/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    fetchNaskah();
  }

  function handleBuatVisual(judul: string) {
    alert(`Fitur "Buat Panduan Visual dari: ${judul}" akan terhubung ke AI Chat di Fase 6.`);
  }

  return (
    <main style={{ maxWidth: 700, margin: "0 auto", padding: 24 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 16 }}>
        Menu Naskah
      </h1>

      <form onSubmit={handleAdd} style={{ marginBottom: 32, display: "flex", flexDirection: "column", gap: 8 }}>
        <input
          type="text"
          placeholder="Judul naskah"
          value={judul}
          onChange={(e) => setJudul(e.target.value)}
          required
          style={{ padding: 8 }}
        />

        <textarea
          placeholder="Isi naskah (opsional, bisa diisi belakangan)"
          value={isiNaskah}
          onChange={(e) => setIsiNaskah(e.target.value)}
          rows={6}
          style={{ padding: 8 }}
        />

        <button type="submit" disabled={submitting} style={{ padding: 10, cursor: "pointer" }}>
          {submitting ? "Menyimpan..." : "Tambah Naskah"}
        </button>

        {message && <p>{message}</p>}
      </form>

      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>Daftar Naskah</h2>

      {loading ? (
        <p>Memuat...</p>
      ) : items.length === 0 ? (
        <p>Belum ada naskah tersimpan.</p>
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
                      value={editIsi}
                      onChange={(e) => setEditIsi(e.target.value)}
                      rows={6}
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
                    <div style={{ fontWeight: 600 }}>{item.judul}</div>
                    {item.isi_naskah && (
                      <div
                        style={{
                          fontSize: 14,
                          opacity: 0.8,
                          marginTop: 4,
                          whiteSpace: "pre-wrap",
                        }}
                      >
                        {item.isi_naskah}
                      </div>
                    )}
                    <div style={{ fontSize: 12, opacity: 0.5, marginTop: 4 }}>
                      Status: {item.status}
                    </div>
                    <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                      <button
                        onClick={() => startEdit(item)}
                        style={{ padding: "6px 12px", cursor: "pointer" }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleToggleStatus(item)}
                        style={{ padding: "6px 12px", cursor: "pointer" }}
                      >
                        {item.status === "draft" ? "Tandai Disetujui" : "Kembalikan ke Draft"}
                      </button>
                      <button
                        onClick={() => handleBuatVisual(item.judul)}
                        style={{ padding: "6px 12px", cursor: "pointer" }}
                      >
                        Buat Panduan Visual dari Naskah Ini
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