// Multi-Format Export Utility for HarNug Studio V2.0

export function downloadFile(filename: string, text: string, mimeType = "text/plain") {
  const element = document.createElement("a");
  const file = new Blob([text], { type: mimeType });
  element.href = URL.createObjectURL(file);
  element.download = filename;
  document.body.appendChild(element);
  element.click();
  document.body.removeChild(element);
}

export function exportScriptToMarkdown(naskah: any): string {
  return `# ${naskah.judul || "Naskah Video"}

**Status:** ${naskah.status || "Draft"}
**Tanggal Dibuat:** ${naskah.created_at ? new Date(naskah.created_at).toLocaleDateString("id-ID") : "-"}

## Naskah Utuh (Bahasa Indonesia)

\`\`\`
${naskah.isi_naskah || "Belum ada isi naskah"}
\`\`\`

${
  naskah.english_script
    ? `\n## Naskah Utuh (English Version)\n\n\`\`\`\n${naskah.english_script}\n\`\`\`\n`
    : ""
}

${
  naskah.fact_check_result
    ? `\n## Fact Check & Consistency Report\n\n- **Status Pengecekan:** ${naskah.fact_check_result.statusVerification || "-"}\n- **Skor Konsistensi:** ${naskah.fact_check_result.internalConsistencyScore || 0}/100\n- **Evaluasi:** ${naskah.fact_check_result.ringkasanEvaluasi || "-"}\n`
    : ""
}
`;
}

export function exportVisualToStoryboardMarkdown(visual: any): string {
  const content = visual.isi_visual || {};
  const scenes = Array.isArray(content.scenes) ? content.scenes : [];

  let md = `# Storyboard & Visual Package: ${visual.judul || "Visual"}\n\n`;
  md += `**Style Tag:** ${content.styleTag || "3D Game AAA"}\n`;
  md += `**Bridge Pose Level:** ${content.bridgePoseLevel || "Balanced"}\n\n`;
  md += `--- \n\n`;

  scenes.forEach((scene: any, idx: number) => {
    md += `### Scene ${scene.sceneNumber || idx + 1} (${scene.poseType || "Key Pose"})\n`;
    md += `> **Naskah:** "${scene.naskahChunk}"\n\n`;
    md += `- **Visual:** ${scene.deskripsiVisual}\n`;
    md += `- **Shot Type:** ${scene.shotType}\n`;
    md += `- **CapCut Effect:** ${scene.capcutTechnique}\n\n`;
    md += `\`\`\`
GOOGLE FLOW PROMPT:
${scene.googleFlowPrompt || scene.deskripsiVisual}
\`\`\`\n\n`;
  });

  return md;
}

export function exportVisualToTxtPrompts(visual: any): string {
  const content = visual.isi_visual || {};
  const scenes = Array.isArray(content.scenes) ? content.scenes : [];

  return scenes
    .map(
      (scene: any, idx: number) =>
        `--- Scene ${scene.sceneNumber || idx + 1} (${scene.poseType || "Pose"}) ---\n${scene.googleFlowPrompt || scene.deskripsiVisual}`
    )
    .join("\n\n");
}

export function exportToJSON(data: any): string {
  return JSON.stringify(data, null, 2);
}
