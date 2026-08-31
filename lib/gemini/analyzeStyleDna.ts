// Menganalisis kumpulan naskah referensi (Menu Referensi) menjadi "DNA Gaya" terstruktur.
// DNA ini yang dipakai saat generate Topik & Naskah, BUKAN naskah mentah secara langsung.
// Pendekatan 2 tahap ini membuat AI benar-benar meniru pola (bukan sekadar "terinspirasi"
// dari teks mentah yang tercampur dengan instruksi lain saat generate).

import { GeminiQuotaError } from "./keyRotation";
import { DEFAULT_GEMINI_MODEL } from "../config";

export interface StyleDna {
  hookPattern: string; // Bagaimana 1-3 kalimat pembuka dibangun (formula, bukan contoh)
  strukturBeat: string[]; // Urutan tahapan cerita yang konsisten muncul
  gayaBahasa: string; // Formal/santai, istilah khas, panjang kalimat rata-rata
  diksiKhas: string[]; // Kata/frasa yang berulang muncul sebagai ciri khas channel ini
  teknikTransisi: string; // Bagaimana antar-beat/kalimat disambung
  closingPattern: string; // Bagaimana naskah biasanya ditutup
  panjangKalimatRataRata: string; // Deskripsi pendek, misal "pendek-pendek, 5-10 kata per kalimat"
  halYangDihindari: string[]; // Pola yang TIDAK pernah muncul di channel ini (penting untuk instruksi negatif)
  ringkasanKarakter: string; // Ringkasan 2-3 kalimat "kepribadian" penulisan channel ini secara keseluruhan
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const EMPTY_STYLE_DNA: StyleDna = {
  hookPattern: "",
  strukturBeat: [],
  gayaBahasa: "",
  diksiKhas: [],
  teknikTransisi: "",
  closingPattern: "",
  panjangKalimatRataRata: "",
  halYangDihindari: [],
  ringkasanKarakter: "",
};

export async function analyzeStyleDna(
  entries: { title: string; fullScript: string }[],
  apiKey: string,
  model: string = DEFAULT_GEMINI_MODEL
): Promise<StyleDna> {
  const validEntries = entries.filter((e) => e.fullScript && e.fullScript.trim().length > 0);

  if (validEntries.length === 0) {
    return EMPTY_STYLE_DNA;
  }

  const combinedSamples = validEntries
    .map(
      (e, i) =>
        `--- NASKAH CONTOH ${i + 1} ---\nJudul: "${e.title}"\nNaskah:\n${e.fullScript}`
    )
    .join("\n\n");

  const prompt = `Kamu adalah analis gaya penulisan naskah YouTube Shorts yang sangat teliti.

Di bawah ini ada ${validEntries.length} naskah asli dari channel YouTube yang sama. Tugasmu BUKAN meringkas isi ceritanya, tapi membedah POLA GAYA PENULISAN yang konsisten muncul di semua/sebagian besar naskah ini.

${combinedSamples}

Analisis dan ekstrak pola gaya di atas. Fokus pada HAL YANG BERULANG dan KONSISTEN di semua contoh, abaikan detail yang cuma muncul sekali (itu kebetulan, bukan pola). Jika hanya ada 1 contoh naskah, tetap ekstrak pola sedetail mungkin dari struktur kalimatnya.

Balas HANYA dengan JSON PERSIS seperti format berikut, tanpa markdown, tanpa backtick, tanpa teks lain:

{
  "hookPattern": "Deskripsi konkret formula 1-3 kalimat pembuka yang dipakai berulang, contoh: 'selalu dibuka dengan pernyataan kontras/mengejutkan tanpa basa-basi, tanpa pertanyaan retoris'",
  "strukturBeat": ["urutan tahapan naskah dari awal sampai akhir, mis: hook fakta -> konteks singkat -> detail kronologis -> twist/kontras -> closing reflektif"],
  "gayaBahasa": "Deskripsi konkret: formal/santai, pakai istilah apa, sudut pandang (orang pertama/ketiga), tingkat kedekatan dengan penonton",
  "diksiKhas": ["kata atau frasa spesifik yang berulang muncul sebagai ciri khas, maksimal 8 item"],
  "teknikTransisi": "Bagaimana kalimat/beat disambung satu sama lain, mis: pakai kata sambung sebab-akibat, atau lompatan waktu langsung tanpa transisi verbal",
  "closingPattern": "Bagaimana naskah ini biasanya ditutup, formulanya seperti apa",
  "panjangKalimatRataRata": "Deskripsi singkat panjang & ritme kalimat, mis: 'kalimat pendek 6-10 kata, banyak jeda, seperti bicara langsung ke kamera'",
  "halYangDihindari": ["pola generik/klise yang TIDAK PERNAH dipakai channel ini, mis: 'tidak pernah pakai kalimat tanya klise seperti Tahukah kamu'"],
  "ringkasanKarakter": "Ringkasan 2-3 kalimat kepribadian menulis channel ini secara keseluruhan, seolah kamu menjelaskan ke penulis baru yang akan menggantikan penulis asli"
}`;

  const MAX_RETRIES = 2;
  const RETRY_DELAY_MS = 5000;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.3, // Rendah: kita mau ekstraksi presisi, bukan kreativitas
          },
        }),
      }
    );

    if (response.ok) {
      const data = await response.json();
      const rawText: string = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
      const cleaned = rawText.replace(/```json|```/g, "").trim();

      try {
        const parsed = JSON.parse(cleaned);
        return {
          hookPattern: parsed.hookPattern || "",
          strukturBeat: Array.isArray(parsed.strukturBeat) ? parsed.strukturBeat : [],
          gayaBahasa: parsed.gayaBahasa || "",
          diksiKhas: Array.isArray(parsed.diksiKhas) ? parsed.diksiKhas : [],
          teknikTransisi: parsed.teknikTransisi || "",
          closingPattern: parsed.closingPattern || "",
          panjangKalimatRataRata: parsed.panjangKalimatRataRata || "",
          halYangDihindari: Array.isArray(parsed.halYangDihindari) ? parsed.halYangDihindari : [],
          ringkasanKarakter: parsed.ringkasanKarakter || "",
        };
      } catch (e) {
        throw new Error(`Gagal parse hasil analisis DNA gaya: ${cleaned.slice(0, 200)}`);
      }
    }

    const errText = await response.text();

    if (response.status === 429) {
      if (errText.toLowerCase().includes("quota")) {
        throw new GeminiQuotaError(`Gemini API quota exceeded (429) - ${errText.slice(0, 200)}`);
      } else {
        if (attempt < MAX_RETRIES) {
          lastError = new Error(`Gemini API Rate Limit (429) - mencoba lagi...`);
          await sleep(20000);
          continue;
        } else {
          throw new Error(`Terlalu sering request (Rate Limit 429). Mohon tunggu beberapa saat.`);
        }
      }
    }

    if (response.status === 503 && attempt < MAX_RETRIES) {
      lastError = new Error(
        `Gemini API 503 (percobaan ${attempt + 1}/${MAX_RETRIES + 1}) - server sibuk, mencoba lagi...`
      );
      await sleep(RETRY_DELAY_MS);
      continue;
    }

    throw new Error(`Gemini API error: ${response.status} - ${errText}`);
  }

  throw lastError || new Error("Gagal menganalisis DNA gaya setelah beberapa percobaan");
}
