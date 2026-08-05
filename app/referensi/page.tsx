"use client";

import { useEffect, useState } from "react";

type Entry = {
  id: string;
  title: string;
  video_link: string | null;
  full_script: string;
};

type ChannelProfile = {
  id: string;
  profile_name: string;
  channel_link: string | null;
  channel_analysis_entries?: Entry[];
  created_at: string;
};

export default function ReferensiPage() {
  const [profiles, setProfiles] = useState<ChannelProfile[]>([]);
  const [loading, setLoading] = useState(true);

  // New Profile Form State
  const [profileName, setProfileName] = useState("");
  const [channelLink, setChannelLink] = useState("");
  const [creating, setCreating] = useState(false);

  // Active Selected Profile for adding entries
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [entryTitle, setEntryTitle] = useState("");
  const [entryVideoLink, setEntryVideoLink] = useState("");
  const [entryFullScript, setEntryFullScript] = useState("");
  const [addingEntry, setAddingEntry] = useState(false);

  async function fetchProfiles() {
    setLoading(true);
    try {
      const res = await fetch("/api/channel-analysis");
      const json = await res.json();
      if (json.data) setProfiles(json.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchProfiles();
  }, []);

  async function handleCreateProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!profileName.trim()) return alert("Nama profil wajib diisi");

    setCreating(true);
    try {
      const res = await fetch("/api/channel-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileName, channelLink }),
      });
      const json = await res.json();
      if (json.error) {
        alert("Gagal membuat profil: " + json.error);
      } else {
        setProfileName("");
        setChannelLink("");
        fetchProfiles();
      }
    } catch (err: any) {
      alert("Error: " + err.message);
    } finally {
      setCreating(false);
    }
  }

  async function handleAddEntry(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedProfileId) return;
    if (!entryTitle.trim() || !entryFullScript.trim()) return alert("Judul dan Naskah wajib diisi");

    setAddingEntry(true);
    try {
      const res = await fetch(`/api/channel-analysis/${selectedProfileId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: entryTitle,
          videoLink: entryVideoLink,
          fullScript: entryFullScript,
        }),
      });
      const json = await res.json();
      if (json.error) {
        alert("Gagal menambah entri: " + json.error);
      } else {
        setEntryTitle("");
        setEntryVideoLink("");
        setEntryFullScript("");
        fetchProfiles();
      }
    } catch (err: any) {
      alert("Error: " + err.message);
    } finally {
      setAddingEntry(false);
    }
  }

  async function handleDeleteProfile(id: string) {
    if (!confirm("Yakin mau hapus profil analisis channel ini beserta semua entrinya?")) return;
    await fetch(`/api/channel-analysis/${id}`, { method: "DELETE" });
    if (selectedProfileId === id) setSelectedProfileId(null);
    fetchProfiles();
  }

  return (
    <div className="animate-fade-in">
      {/* Subtitle Halaman */}
      <div style={{ marginBottom: 16 }}>
        <p className="page-subtitle">
          Simpan profil analisis per channel referensi (5-10 naskah contoh) untuk digunakan sebagai kalibrasi saat generate Topic & Script.
        </p>
      </div>

      {/* Create Profile Form */}
      <div className="glass-card-static" style={{ padding: 22, marginBottom: 28 }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 16, color: "var(--text-primary)" }}>
          Tambah Profil Channel Referensi Baru
        </div>
        <form onSubmit={handleCreateProfile} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14 }}>
          <div>
            <label className="form-label">Nama Profil / Channel *</label>
            <input
              type="text"
              placeholder="Contoh: Bright Side / Veritasium / Channel X"
              value={profileName}
              onChange={(e) => setProfileName(e.target.value)}
              required
              className="input-field"
            />
          </div>
          <div>
            <label className="form-label">Link Channel (Opsional)</label>
            <input
              type="text"
              placeholder="Contoh: https://youtube.com/@channelname"
              value={channelLink}
              onChange={(e) => setChannelLink(e.target.value)}
              className="input-field"
            />
          </div>
          <div style={{ display: "flex", alignItems: "flex-end" }}>
            <button type="submit" disabled={creating} className="btn btn-primary" style={{ width: "100%", justifyContent: "center" }}>
              {creating ? <><span className="spinner" /> Membuat Profil...</> : "Simpan Profil Channel"}
            </button>
          </div>
        </form>
      </div>

      {/* Channel Profiles Grid */}
      <div className="section-title">Profil Analisis Channel ({profiles.length})</div>

      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {[1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 120 }} />)}
        </div>
      ) : profiles.length === 0 ? (
        <div className="glass-card-static" style={{ padding: 32, textAlign: "center" }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>📺</div>
          <div style={{ fontSize: 13, color: "var(--text-tertiary)" }}>Belum ada profil analisis channel. Buat profil pertama di atas.</div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 }}>
          {profiles.map((prof) => {
            const entries = prof.channel_analysis_entries || [];
            const isSelected = selectedProfileId === prof.id;

            return (
              <div key={prof.id} className="glass-card-static" style={{ padding: 20, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 10 }}>
                    <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>{prof.profile_name}</h3>
                    <span className="badge badge-neutral">{entries.length} Naskah</span>
                  </div>

                  {prof.channel_link && (
                    <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 12, wordBreak: "break-all" }}>
                      🔗 <a href={prof.channel_link} target="_blank" rel="noreferrer" style={{ color: "var(--text-secondary)", textDecoration: "underline" }}>{prof.channel_link}</a>
                    </div>
                  )}

                  {/* Entries summary */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
                    {entries.slice(0, 5).map((entry) => (
                      <div key={entry.id} style={{ background: "var(--bg-tertiary)", padding: "6px 10px", borderRadius: "var(--radius-sm)", fontSize: 12, color: "var(--text-primary)" }}>
                        📄 <strong>{entry.title}</strong>
                      </div>
                    ))}
                    {entries.length > 5 && (
                      <div style={{ fontSize: 11, color: "var(--text-tertiary)", fontStyle: "italic" }}>
                        + {entries.length - 5} entri lainnya...
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <button
                    onClick={() => setSelectedProfileId(isSelected ? null : prof.id)}
                    className={`btn ${isSelected ? "btn-primary" : "btn-secondary"} btn-sm`}
                    style={{ flex: 1, justifyContent: "center" }}
                  >
                    {isSelected ? "Tutup Edit Entri" : "📝 Kelola Entri"}
                  </button>
                  <button onClick={() => handleDeleteProfile(prof.id)} className="btn btn-danger btn-sm">Hapus</button>
                </div>

                {/* Expandable Add Entry Form */}
                {isSelected && (
                  <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--border-subtle)" }}>
                    <h4 style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: "var(--text-primary)" }}>
                      Tambah Entri Video/Naskah ke &ldquo;{prof.profile_name}&rdquo;
                    </h4>
                    <form onSubmit={handleAddEntry} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      <input
                        type="text"
                        placeholder="Judul Video Contoh *"
                        value={entryTitle}
                        onChange={(e) => setEntryTitle(e.target.value)}
                        required
                        className="input-field"
                      />
                      <input
                        type="text"
                        placeholder="Link Video Contoh (Opsional)"
                        value={entryVideoLink}
                        onChange={(e) => setEntryVideoLink(e.target.value)}
                        className="input-field"
                      />
                      <textarea
                        placeholder="Full Script Video Contoh (akan digunakan sebagai kalibrasi gaya naskah)... *"
                        value={entryFullScript}
                        onChange={(e) => setEntryFullScript(e.target.value)}
                        required
                        rows={4}
                        className="textarea-field"
                      />
                      <button type="submit" disabled={addingEntry} className="btn btn-primary btn-sm" style={{ justifyContent: "center" }}>
                        {addingEntry ? <span className="spinner" /> : "➕ Tambah Entri Kalibrasi"}
                      </button>
                    </form>
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