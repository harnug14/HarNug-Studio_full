// Mengirim pesan chat ke Gemini, dengan dukungan mode: biasa, mendalam, berpikir, search (grounding)

import { GeminiQuotaError } from "./keyRotation";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export type ChatMode = "biasa" | "mendalam" | "berpikir" | "search";
export type ContentTarget = "topik" | "naskah" | "visual" | null;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function buildStyleInstruction(mode: ChatMode): string {
  const baseStyle =
    "Gunakan bahasa Indonesia yang netral, sopan, dan jelas. JANGAN gunakan bahasa gaul kasual seperti 'lo', 'gue', 'elo', atau sejenisnya — gunakan 'kamu'/'Anda' dan kata baku.";

  switch (mode) {
    case "mendalam":
      return `${baseStyle} Jawab secara sangat detail, analitis, dan komprehensif. Berikan konteks, latar belakang, dan berbagai sudut pandang jika relevan.`;
    case "berpikir":
      return `${baseStyle} Sebelum memberi jawaban akhir, jabarkan dulu proses berpikirmu langkah demi langkah (chain-of-thought) secara eksplisit, baru berikan kesimpulan/jawaban akhir.`;
    case "search":
      return `${baseStyle} Gunakan hasil pencarian web untuk memastikan jawabanmu akurat dan berdasarkan informasi terkini.`;
    case "biasa":
    default:
      return `${baseStyle} Jawab secara natural dan ringkas seperti obrolan biasa, tapi tetap sopan.`;
  }
}

const VERIFICATION_HONESTY_INSTRUCTION =
  "\n\nATURAN WAJIB SAAT USER BERTANYA VERIFIKASI/KEBENARAN (misalnya 'emang bener itu?', 'beneran akurat?', 'coba cek lagi'): kamu WAJIB benar-benar mengecek ulang dengan jujur, BUKAN otomatis membenarkan/mempertahankan apa yang sudah kamu tulis sebelumnya. Kalau setelah dicek ulang kamu menemukan bagian yang meragukan, mengada-ada, atau kamu sebenarnya tidak yakin — WAJIB akui itu secara eksplisit dan jelaskan bagian mana yang meragukan. JANGAN PERNAH menjawab 'ya, itu 100% akurat' hanya untuk menyenangkan atau menghindari terlihat salah. DILARANG KERAS menambahkan detail/angka BARU yang belum pernah disebutkan sebelumnya sebagai 'bukti' saat menjawab pertanyaan verifikasi — itu sama saja mengarang lagi.";

export function buildContentInstruction(contentTarget: ContentTarget): string {
  switch (contentTarget) {
    case "topik":
      return "Kamu sedang membantu ideasi TOPIK video YouTube Shorts. Fokus HANYA pada ide/judul topik dan penjelasan singkat kenapa topik itu menarik. JANGAN membuat naskah lengkap, JANGAN membahas visual, B-roll, atau teknik editing di tahap ini — itu bukan bagian dari tahap ini.\n\nFORMAT WAJIB: setiap kali kamu memberikan satu atau beberapa ide/opsi topik video (baik diminta satu maupun banyak sekaligus), tulis SETIAP ide dalam satu baris terpisah dengan format PERSIS seperti ini, tanpa markdown tambahan (tanpa bold/asterisk) di dalam baris itu:\n[TOPIK] Judul singkat topik | Penjelasan singkat 1-2 kalimat kenapa topik ini menarik\n\nContoh (untuk 3 ide):\n[TOPIK] Misteri Kota yang Menghilang | Membahas legenda kota yang lenyap dalam semalam, menarik karena menimbulkan teori konspirasi dan sejarah.\n[TOPIK] Hewan dengan Kemampuan Tersembunyi | Fokus pada satu spesies dengan kemampuan biologis unik yang jarang diketahui orang.\n[TOPIK] Fenomena Alam yang Menyerupai Fiksi | Membahas kejadian nyata di alam yang terdengar seperti fiksi ilmiah.\n\nKamu BOLEH menulis kalimat pembuka atau penutup di luar format itu (misalnya \"Berikut beberapa ide topik:\" di awal, atau pertanyaan follow-up di akhir), tapi SETIAP baris ide topik itu sendiri WAJIB persis mengikuti format `[TOPIK] Judul | Penjelasan` itu.\n\nJika kamu sedang TIDAK memberikan ide/opsi topik baru (misalnya sedang menjawab pertanyaan, mendiskusikan/merevisi satu topik yang sudah ada dalam bentuk paragraf, atau membahas hal lain), JANGAN gunakan format itu — jawab secara natural seperti biasa." + VERIFICATION_HONESTY_INSTRUCTION;

    case "naskah":
      return "Kamu sedang membantu membuat NASKAH video YouTube Shorts. Fokus HANYA pada naskah/skrip murni — kalimat yang akan diucapkan atau dibacakan dari awal sampai akhir video. JANGAN menyertakan instruksi visual, B-roll, gerakan kamera, transisi, teks di layar, atau elemen editing apa pun — itu akan dibahas terpisah di tahap panduan visual, bukan di tahap ini.\n\nWAJIB SPESIFIK, BUKAN GENERIK: naskah HARUS berisi fakta/detail konkret yang hanya berlaku untuk topik ini — nama orang/tempat/benda asli, angka atau tahun spesifik, kejadian nyata. DILARANG KERAS menulis kalimat generik yang bisa dipakai untuk topik manapun.\n\nWAJIB PAKAI SUMBER LINK ASLI, BUKAN KARANGAN: kamu memiliki akses pencarian web (Google Search). WAJIB gunakan itu untuk mencari fakta dan SUMBER LINK URL ASLI yang mendukung naskah ini. Di akhir naskah, WAJIB tambahkan bagian 'CATATAN SUMBER:' berisi daftar URL/link ASLI dan VALID hasil pencarian web (bukan nama sumber generik seperti 'artikel sejarah populer' atau 'catatan yang sering dikutip' — itu DILARANG KERAS karena itu karangan). Untuk setiap klaim, cantumkan link URL persis dari hasil pencarian. Kalau untuk suatu detail kamu TIDAK menemukan link URL valid lewat pencarian, WAJIB tulis eksplisit 'PERLU DIVERIFIKASI: [detail itu] — tidak ditemukan sumber link yang bisa dipastikan' — JANGAN mengarang link atau nama sumber supaya terlihat meyakinkan.\n\nPENANDA WAJIB: kalau balasan ini adalah DRAFT NASKAH (baik draft pertama maupun hasil revisi), WAJIB mulai balasan dengan baris pertama persis: [DRAFT_NASKAH]\nKalau balasan ini BUKAN draft naskah (misalnya kamu sedang menjawab pertanyaan, menjelaskan, atau berdiskusi biasa tanpa menulis ulang naskahnya), JANGAN pakai penanda itu sama sekali — jawab natural biasa." + VERIFICATION_HONESTY_INSTRUCTION;

    case "visual":
      return "Kamu sedang membantu membuat PANDUAN VISUAL/STORYBOARD video YouTube Shorts berdasarkan naskah yang sudah ada, UNTUK ALUR PRODUKSI SPESIFIK berikut (WAJIB diikuti, bukan alur produksi umum): (1) Google Flow dipakai untuk generate karakter, background, dan objek beranimasi sebagai ASET TERPISAH per-pose; (2) compositing dan animasi dilakukan di CapCut dengan teknik pose swap, zoom, pan, parallax, dan keyframe animation; (3) SETIAP kalimat naskah dipecah menjadi BEBERAPA POSE karakter berbeda untuk menciptakan ilusi gerakan.\n\nWAJIB KONKRET & BISA LANGSUNG DIEKSEKUSI, BUKAN TEORITIS: untuk SETIAP kalimat/bagian naskah, sebutkan PERSIS: (a) pose/ekspresi karakter apa yang perlu di-generate di Google Flow, (b) aset background/objek terpisah apa yang dibutuhkan, (c) teknik CapCut apa yang dipakai (pose swap / zoom in-out / pan arah mana / parallax layer apa), (d) teks di layar kalau ada (tulis persis teksnya), (e) sound effect kalau relevan. DILARANG menulis instruksi umum tanpa menyebutkan pose/teknik/aset yang PERSIS.\n\nPENANDA WAJIB: kalau balasan ini adalah DRAFT PANDUAN VISUAL (baik draft pertama maupun hasil revisi), WAJIB mulai balasan dengan baris pertama persis: [DRAFT_VISUAL]\nKalau balasan ini BUKAN draft panduan visual (misalnya kamu sedang menjawab pertanyaan atau berdiskusi biasa), JANGAN pakai penanda itu sama sekali — jawab natural biasa." + VERIFICATION_HONESTY_INSTRUCTION;

    default:
      return "";
  }
}

export async function chatWithGemini(
  messages: ChatMessage[],
  apiKey: string,
  model: string,
  mode: ChatMode,
  contextText?: string,
  contentTarget: ContentTarget = null
): Promise<string> {
  const styleInstruction = buildStyleInstruction(mode);
  const contentInstruction = buildContentInstruction(contentTarget);
  const systemInstruction = contentInstruction
    ? `${contentInstruction}\n\n${styleInstruction}`
    : styleInstruction;

  const contents = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  if (contextText) {
    contents.unshift({
      role: "user",
      parts: [{ text: `Konteks awal:\n${contextText}` }],
    });
  }

  const body: any = {
    contents,
    systemInstruction: {
      parts: [{ text: systemInstruction }],
    },
  };

  // Search grounding aktif hanya jika mode === "search" (Manual)
  if (mode === "search") {
    body.tools = [{ google_search: {} }];
  }

  const MAX_RETRIES = 2;
  const RETRY_DELAY_MS = 5000;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );

    if (response.ok) {
      const data = await response.json();
      const rawText: string =
        data.candidates?.[0]?.content?.parts?.[0]?.text || "";
      return rawText;
    }

    const errText = await response.text();

    if (response.status === 429) {
      if (errText.toLowerCase().includes("quota")) {
        throw new GeminiQuotaError(
          `Gemini API quota exceeded (429) - ${errText.slice(0, 200)}`
        );
      } else {
        if (attempt < MAX_RETRIES) {
          lastError = new Error(`Gemini API Rate Limit (429) - mencoba lagi...`);
          await sleep(20000); // 20 detik
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

  throw lastError || new Error("Gagal chat setelah beberapa percobaan");
}