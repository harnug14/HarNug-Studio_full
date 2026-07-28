"use client";

import { useState } from "react";
import {
  downloadFile,
  exportScriptToMarkdown,
  exportVisualToStoryboardMarkdown,
  exportVisualToTxtPrompts,
  exportToJSON,
} from "@/lib/exporter";

type ExportModalProps = {
  item: any;
  type: "script" | "visual";
  onClose: () => void;
};

export default function ExportModal({ item, type, onClose }: ExportModalProps) {
  const [copiedFormat, setCopiedFormat] = useState<string | null>(null);

  const safeTitle = (item.judul || "export").toLowerCase().replace(/[^a-z0-9]/g, "_");

  function handleDownload(format: "md" | "txt" | "json") {
    if (type === "script") {
      if (format === "md") {
        const mdText = exportScriptToMarkdown(item);
        downloadFile(`${safeTitle}_script.md`, mdText, "text/markdown");
      } else if (format === "txt") {
        const txtText = `${item.judul}\n\n${item.isi_naskah}${item.english_script ? `\n\n--- ENGLISH VERSION ---\n${item.english_script}` : ""}`;
        downloadFile(`${safeTitle}_script.txt`, txtText, "text/plain");
      } else if (format === "json") {
        const jsonText = exportToJSON(item);
        downloadFile(`${safeTitle}_script.json`, jsonText, "application/json");
      }
    } else {
      if (format === "md") {
        const mdText = exportVisualToStoryboardMarkdown(item);
        downloadFile(`${safeTitle}_storyboard.md`, mdText, "text/markdown");
      } else if (format === "txt") {
        const txtText = exportVisualToTxtPrompts(item);
        downloadFile(`${safeTitle}_prompts.txt`, txtText, "text/plain");
      } else if (format === "json") {
        const jsonText = exportToJSON(item);
        downloadFile(`${safeTitle}_visual.json`, jsonText, "application/json");
      }
    }
  }

  function handleCopy(format: "md" | "txt" | "json") {
    let content = "";
    if (type === "script") {
      if (format === "md") content = exportScriptToMarkdown(item);
      else if (format === "txt") content = `${item.judul}\n\n${item.isi_naskah}`;
      else content = exportToJSON(item);
    } else {
      if (format === "md") content = exportVisualToStoryboardMarkdown(item);
      else if (format === "txt") content = exportVisualToTxtPrompts(item);
      else content = exportToJSON(item);
    }

    navigator.clipboard.writeText(content);
    setCopiedFormat(format);
    setTimeout(() => setCopiedFormat(null), 2000);
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.8)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 120,
        padding: 20,
      }}
    >
      <div className="glass-card-static" style={{ width: "100%", maxWidth: 520, padding: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ fontSize: 18, fontWeight: 600, color: "var(--text-primary)" }}>
            📦 Export Multi-Format Ready Package
          </h3>
          <button onClick={onClose} className="btn btn-ghost btn-sm">✕</button>
        </div>

        <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 20 }}>
          Pilih format export untuk <strong>{item.judul}</strong>. Siap digunakan untuk dibaca manusia, dipaste ke Google Flow, atau diotomatisasi ke n8n/Make.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 }}>
          {/* Markdown Option */}
          <div style={{ background: "rgba(255,255,255,0.03)", padding: 14, borderRadius: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>📄 Markdown (.md)</div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Format teks kaya (Script/Storyboard) untuk dibaca manusia</div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => handleCopy("md")} className="btn btn-ghost btn-sm">
                {copiedFormat === "md" ? "✓ Copied" : "Copy"}
              </button>
              <button onClick={() => handleDownload("md")} className="btn btn-primary btn-sm">Download</button>
            </div>
          </div>

          {/* TXT Option */}
          <div style={{ background: "rgba(255,255,255,0.03)", padding: 14, borderRadius: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>📝 Text File (.txt)</div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Prompt siap paste ke Google Flow / Midjourney / CapCut</div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => handleCopy("txt")} className="btn btn-ghost btn-sm">
                {copiedFormat === "txt" ? "✓ Copied" : "Copy"}
              </button>
              <button onClick={() => handleDownload("txt")} className="btn btn-primary btn-sm">Download</button>
            </div>
          </div>

          {/* JSON Option */}
          <div style={{ background: "rgba(255,255,255,0.03)", padding: 14, borderRadius: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>⚡ Structured JSON (.json)</div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Data terstruktur siap integrasi otomatis ke n8n / Make</div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => handleCopy("json")} className="btn btn-ghost btn-sm">
                {copiedFormat === "json" ? "✓ Copied" : "Copy"}
              </button>
              <button onClick={() => handleDownload("json")} className="btn btn-primary btn-sm">Download</button>
            </div>
          </div>
        </div>

        <button onClick={onClose} className="btn btn-ghost btn-sm" style={{ width: "100%", justifyContent: "center" }}>
          Selesai
        </button>
      </div>
    </div>
  );
}
