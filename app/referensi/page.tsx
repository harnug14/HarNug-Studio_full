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
      <div className="page-header" style={{ marginBottom: 24 }}>
        <h1 className="page-title">Menu Analisis Channel</h1>
        <p className="page-subtitle">
          Simpan profil analisis per channel referensi (5-10 naskah contoh) untuk digunakan sebagai kalibrasi saat generate Topic & Script.
        </p>
      </div>

      {/* Create Profile Form */}
      <div className="glass-card-static" style={{ padding: 24, marginBottom: 32 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, color: "var(--text-primary)" }}>
          ➕ Tambah Profil Channel Referensi Baru
        </h3>
        <form onSubmit={handleCreateProfile} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
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
              {creating ? <><span className="spinner" />Buat Profil...</> : <>Simpan Profil Channel</>}
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
        <div className="empty-state">
          <div className="empty-state-icon">📺</div>
          <div className="empty-state-text">Belum ada profil analisis channel. Buat profil pertama di atas.</div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 20 }}>
          {profiles.map((prof) => {
            const entries = prof.channel_analysis_entries || [];
            const isSelected = selectedProfileId === prof.id;

            return (
              <div key={prof.id} className="glass-card-static" style={{ padding: 20, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 10 }}>
                    <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)" }}>{prof.profile_name}</h3>
                    <span className="badge badge-accent">{entries.length} Entri Naskah</span>
                  </div>

                  {prof.channel_link && (
                    <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 12, wordBreak: "break-all" }}>
                      🔗 <a href={prof.channel_link} target="_blank" rel="noreferrer" style={{ color: "var(--accent-primary)" }}>{prof.channel_link}</a>
                    </div>
                  )}

                  {/* Entries summary */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
                    {entries.slice(0, 5).map((entry) => (
                      <div key={entry.id} style={{ background: "rgba(255,255,255,0.03)", padding: "6px 10px", borderRadius: 6, fontSize: 12 }}>
                        📄 <strong>{entry.title}</strong>
                      </div>
                    ))}
                    {entries.length > 5 && (
                      <div style={{ fontSize: 11, color: "var(--text-secondary)", fontStyle: "italic" }}>
                        + {entries.length - 5} entri lainnya...
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <button
                    onClick={() => setSelectedProfileId(isSelected ? null : prof.id)}
                    className={`btn ${isSelected ? "btn-primary" : "btn-ghost"} btn-sm`}
                    style={{ flex: 1, justifyContent: "center" }}
                  >
                    {isSelected ? "Tutup Edit Entri" : "📝 Kelola 5-10 Entri"}
                  </button>
                  <button onClick={() => handleDeleteProfile(prof.id)} className="btn btn-danger btn-sm">Hapus</button>
                </div>

                {/* Expandable Add Entry Form */}
                {isSelected && (
                  <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                    <h4 style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: "var(--accent-primary)" }}>
                      Tambah Entri Video/Naskah ke "{prof.profile_name}"
                    </h4>
                    <form onSubmit={handleAddEntry} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      <input
                        type="text"
                        placeholder="Judul Video Contoh *"
                        value={entryTitle}
                        onChange={(e) => setEntryTitle(e.target.value)}
                        required
                        className="input-field"
                        style={{ fontSize: 13 }}
                      />
                      <input
                        type="text"
                        placeholder="Link Video Contoh (Opsional)"
                        value={entryVideoLink}
                        onChange={(e) => setEntryVideoLink(e.target.value)}
                        className="input-field"
                        style={{ fontSize: 13 }}
                      />
                      <textarea
                        placeholder="Full Script Video Contoh (akan digunakan sebagai kalibrasi gaya naskah)... *"
                        value={entryFullScript}
                        onChange={(e) => setEntryFullScript(e.target.value)}
                        required
                        rows={4}
                        className="textarea-field"
                        style={{ fontSize: 13 }}
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