# HANDOVER KE ANTIGRAVITY — AI Creator Studio (HarNug Studio)

Dokumen ini dibuat untuk memberi konteks lengkap kepada AI yang melanjutkan project ini di Antigravity IDE, supaya tidak mengulang kesalahan yang sudah pernah terjadi dan tidak menghapus perbaikan yang sudah teruji.

**Folder project:** `C:\Users\HarNug\Desktop\harnug-studio-full`
**Stack:** Next.js + Supabase + Vercel
**Repo:** `github.com/harnug14/HarNug-Studio_full`, branch `main`, auto-deploy ke Vercel aktif
**User (Harnug) tidak bisa membaca/menulis kode.** Semua instruksi ke user harus sangat detail, satu langkah per giliran, dan revisi kode selalu diberikan sebagai FULL FILE (bukan potongan/cari-ganti), karena user tidak bisa melakukan edit manual yang presisi.

---

## 1. KONSEP PRODUK

Aplikasi personal (bukan multi-tenant publik) untuk membantu satu kreator YouTube Shorts (Harnug) memproduksi video edukasi/storytelling untuk pasar Amerika. Alur kerja linear:

```
[Referensi] → analisis channel kompetitor via YouTube API + Gemini
     ↓ (tombol "Buat Ide Topik dari Referensi Ini")
[AI Chat] → AI menghasilkan beberapa KARTU ide topik
     ↓ (ikon simpan per-kartu)
[Topik] → tersimpan, bisa juga diisi manual
     ↓ (klik judul topik → auto ke AI Chat)
[AI Chat] → AI membuatkan NASKAH (wajib riset web + sumber link asli)
     ↓ (ikon simpan draft)
[Naskah] → tersimpan
     ↓ (klik judul naskah → auto ke AI Chat)
[AI Chat] → AI membuatkan PANDUAN VISUAL (storyboard sesuai alur produksi Harnug)
     ↓ (ikon simpan draft)
[Visual] → tersimpan (tahap akhir, tidak ada trigger lanjutan)
```

Produksi video sesungguhnya (di luar aplikasi ini) memakai Google Flow (generate aset karakter/background per-pose) lalu CapCut (compositing: pose swap, zoom, pan, parallax, keyframe).

---

## 2. FASE YANG SUDAH SELESAI & TERKONFIRMASI (jangan dikerjakan ulang, jangan dianggap belum ada)

- **Fase 0-3**: Setup Next.js, autentikasi Supabase, manajemen API Key (YouTube + Gemini, multi-key dengan rotasi) — semua selesai lama.
- **Fase 4 (Referensi)**: Analisis channel YouTube via YouTube Data API + transkrip + Gemini, hasil tersimpan persisten di tabel `referensi`.
- **Fase 5 (Topik/Naskah/Visual)**: CRUD dasar tiap menu, termasuk edit inline.
- **Fase 6 (AI Chat Hub)** — dikerjakan bertahap dengan banyak iterasi bug-fix:
  - Trigger klik-judul (bukan tombol terpisah) untuk masuk AI Chat dari Topik dan Naskah — **SELESAI & terkonfirmasi user via screenshot**.
  - Tombol "Buat Ide Topik dari Referensi Ini" di halaman Referensi — **SELESAI & terkonfirmasi**.
  - Sistem parsing kartu ide topik: AI menandai tiap ide dengan format baris `[TOPIK] Judul | Deskripsi`, frontend mem-parsing ini jadi kartu dengan ikon simpan per-kartu.
  - **Bug besar yang sudah di-fix**: tombol simpan sempat muncul di SEMUA balasan AI (termasuk saat user cuma berdiskusi/bertanya, bukan minta ide/naskah/visual baru). Fix-nya dua lapis:
    1. Untuk `contentTarget === "topik"`: tombol simpan HANYA muncul dari kartu `[TOPIK]` yang berhasil di-parse; kalau balasan tidak ke-parse jadi kartu (berarti obrolan biasa), TIDAK ada tombol simpan sama sekali.
    2. Untuk `contentTarget === "naskah"` dan `"visual"`: AI diwajibkan menandai balasan yang merupakan draft final dengan penanda tersembunyi di baris pertama (`[DRAFT_NASKAH]` atau `[DRAFT_VISUAL]`). Frontend mem-parsing penanda ini (fungsi `parseDraftMarker`) dan menyembunyikannya dari tampilan, ikon simpan HANYA muncul kalau penanda terdeteksi. Kalau balasan itu cuma diskusi/jawaban pertanyaan (bukan draft), AI tidak memakai penanda itu, dan ikon simpan otomatis tidak muncul.
  - **Kualitas naskah diperbaiki**: sebelumnya AI menghasilkan naskah generik tanpa sumber nyata (halusinasi sumber — mengarang nama sumber yang terdengar meyakinkan). Fix: instruksi sistem mewajibkan detail konkret (nama/angka/tahun/tempat spesifik) DAN mewajibkan bagian "CATATAN SUMBER:" di akhir naskah berisi LINK URL ASLI hasil pencarian web (bukan nama sumber generik). Untuk ini, **search grounding (`google_search` tool) di Gemini API diaktifkan otomatis setiap kali `contentTarget === "naskah"`**, terlepas dari mode chat yang dipilih user (biasa/mendalam/dst) — karena AI wajib bisa browsing untuk menemukan link sumber asli.
  - **Kualitas saran visual diperbaiki**: sebelumnya terlalu teoritis ("gunakan visual dramatis"). Fix: instruksi sistem mewajibkan AI menyebutkan PERSIS pose/ekspresi karakter untuk digenerate di Google Flow, aset apa yang dibutuhkan, dan teknik CapCut spesifik (pose swap/zoom/pan/parallax) untuk tiap kalimat naskah.
  - **AI wajib jujur saat diminta verifikasi ulang**: sebelumnya AI selalu menjawab "ya, 100% akurat" ketika user bertanya "emang bener itu?", bahkan kadang menambah detail baru yang mengada-ada sebagai "bukti". Instruksi sistem sekarang eksplisit melarang perilaku ini — AI wajib benar-benar mengecek ulang dan mengakui kalau ada bagian yang meragukan, dilarang menambah detail baru saat menjawab pertanyaan verifikasi.
  - Fitur rename sesi chat (klik ikon pensil di sebelah judul sesi di sidebar riwayat → jadi input teks bisa diedit → Enter/blur → tersimpan via `PATCH /api/chat/[id]` dengan body `{ judul }`) — **SELESAI**.
  - **Fix kritis: `<Suspense>` wrapper untuk `useSearchParams()`**. Next.js versi yang dipakai project ini MEWAJIBKAN komponen manapun yang memakai `useSearchParams()` dibungkus `<Suspense>`, kalau tidak, `npm run build` GAGAL dengan error prerendering, meskipun `npm run dev` di localhost terlihat baik-baik saja. Halaman `/ai-chat` sudah diperbaiki dengan pola: komponen utama diberi nama `AiChatContent` (isi semua logic + `useSearchParams()`), lalu `export default function AiChatPage()` HANYA membungkus `<Suspense fallback={...}><AiChatContent /></Suspense>`. **Pola ini WAJIB dipertahankan di redesign apapun** — kalau file ini ditulis ulang tanpa pola Suspense ini, build production akan gagal lagi.
  - Hapus tombol "Tandai Siap Produksi" (Visual) dan "Tandai Disetujui" (Naskah) — fitur toggle status ini sengaja dihapus atas permintaan user, JANGAN dikembalikan kecuali diminta ulang.
  - Fix bug tombol Hapus di Menu Visual tidak berfungsi — root cause: frontend membungkam semua error API secara diam-diam (`catch (e) { }`), sehingga kegagalan tidak pernah terlihat user. Fix: `handleDelete` sekarang menampilkan `alert()` dengan pesan error asli kalau gagal.

---

## 3. STRUKTUR DATA API — WAJIB DIPATUHI PERSIS (jangan diseragamkan/diasumsikan sama)

Field naming BERBEDA-BEDA antar endpoint, ini bukan inkonsistensi yang perlu "dirapikan", ini adalah kontrak API yang sudah ada dan tidak boleh diubah tanpa mengubah backend juga:

| Endpoint | Body POST/PATCH | Catatan |
|---|---|---|
| `POST /api/topik` | `{ judul, catatan }` | camelCase, field DB juga sama |
| `POST /api/naskah` | `{ judul, isiNaskah, sumberTopikId }` | **camelCase di body**, tapi field DB aktualnya `isi_naskah`, `sumber_topik_id` (snake_case) — API layer yang melakukan konversi |
| `POST /api/visual` | `{ judul, isi_visual, sumber_naskah_id }` | **snake_case penuh**, termasuk di body request, BEDA dari naskah |
| `PATCH /api/chat/[id]` | `{ judul }` | untuk rename sesi |
| Semua dynamic route API | — | WAJIB `await params` (Next.js versi ini pakai `params: Promise<{ id: string }>`) |

---

## 4. MASALAH YANG SEDANG AKTIF — WAJIB DISELESAIKAN LEBIH DULU SEBELUM KERJA LAIN

### 4.1 — Build production gagal karena migrasi `middleware.ts` → `proxy.ts` tidak lengkap

Next.js 16.2.10 di project ini mendeprecate `middleware.ts`, menggantinya dengan konvensi baru `proxy.ts`. File `proxy.ts` sudah dibuat (oleh Antigravity) tapi masih memakai nama fungsi lama:

```typescript
export async function middleware(request: NextRequest) { ... }
```

Ini menyebabkan `npm run build` gagal dengan pesan:
```
Error: Turbopack build failed with 1 errors:
./proxy.ts
Proxy is missing expected function export name
```

**Perbaikan yang wajib dilakukan**: ganti nama fungsi itu jadi:
```typescript
export async function proxy(request: NextRequest) { ... }
```
Isi logic di dalamnya (autentikasi Supabase, redirect ke `/login`) sudah benar dan tidak perlu diubah — HANYA nama fungsinya yang salah.

Setelah itu, cek apakah file `middleware.ts` (versi lama) masih ada di root folder secara duplikat — kalau masih ada, hapus, karena bisa menyebabkan konflik routing.

**WAJIB jalankan `npm run build` sampai benar-benar sukses (bukan cuma `npm run dev`) sebelum mengklaim pekerjaan selesai** — kegagalan build production TIDAK terlihat saat development server berjalan normal, ini pelajaran yang sudah didapat berkali-kali di project ini.

### 4.2 — Redesign UI besar-besaran baru saja terjadi, BELUM diverifikasi menyeluruh

Sebuah redesign UI total ("Premium Dark Mode & Glassmorphism") baru saja dikerjakan yang mengubah hampir semua file di project (termasuk menulis ulang `app/ai-chat/page.tsx` sebanyak +949/-887 baris — praktis file baru total). Perubahan ini SUDAH DITERIMA (accepted) oleh user tanpa verifikasi visual menyeluruh sebelumnya.

Sudah dikonfirmasi via pencarian teks bahwa 4 elemen kritis berikut MASIH ADA di file baru: `DRAFT_NASKAH`, `parseDraftMarker`, `Suspense`, `renamingSessionId`. Namun ini baru pengecekan keberadaan teks, BUKAN pengecekan bahwa logic-nya masih benar berfungsi.

**WAJIB dilakukan sebelum melanjutkan pekerjaan apapun:**
1. Pastikan `npm run build` sukses total (lihat 4.1).
2. Verifikasi ulang SATU PERSATU seluruh alur di atas (bagian 2) di localhost — bukan cuma cek kode ada, tapi benar-benar klik dan coba: kartu topik + ikon simpannya, ikon simpan naskah/visual yang hanya muncul untuk draft, rename sesi, delete di semua menu, field naming yang benar per endpoint.
3. HANYA setelah semua di atas diverifikasi jalan, baru boleh push ke GitHub dan biarkan auto-deploy ke Vercel jalan.
4. JANGAN push ke `main` sebelum `npm run build` lokal sukses — project ini sudah pernah mengalami kejadian production 404 total karena file penting lupa ter-push, dan pernah mengalami build gagal di Vercel padahal localhost terlihat baik-baik saja (karena strictness `useSearchParams()`/`Suspense` yang berbeda antara dev dan build).

---

## 5. HAL YANG BELUM DIKERJAKAN / MASIH TERTUNDA (di luar masalah aktif di atas)

- 3 file lama tidak terpakai belum dihapus (tidak wajib, tidak berbahaya jika dibiarkan): `app/api/keys/test/route.ts`, `lib/apiTesters/testGeminiKey.ts`, `lib/apiTesters/testYoutubeKey.ts`.
- Test end-to-end alur PENUH Referensi → Topik → Naskah → Visual dalam satu rangkaian belum pernah berhasil dilakukan tanpa terganggu bug/kesalahan di tengah jalan — begitu masalah bagian 4 selesai, ini prioritas berikutnya.
- Peningkatan relevansi ide topik terhadap data referensi spesifik (user sempat menyebut ide topik terasa agak random, kurang benar-benar diturunkan dari niche channel referensi) — prioritas rendah, belum digarap.

---

## 6. GAYA KERJA YANG DIHARAPKAN DARI AI YANG MELANJUTKAN

- User (Harnug) tidak bisa membaca kode. JANGAN minta user melakukan "cari baris X, ganti dengan Y" di tengah file — ini terbukti berisiko tinggi salah pada project ini. Berikan FULL FILE untuk setiap revisi.
- SELALU minta melihat kode/isi file aktual sebelum memberi revisi — jangan berasumsi dari nama file atau dari laporan sebelumnya.
- SELALU jalankan `npm run build` (bukan cuma `npm run dev`) sebelum mengklaim sesuatu "siap production" atau "tidak ada bug".
- Laporan progres ke user sebaiknya faktual dan bisa diverifikasi (apa yang benar-benar dites, bukan klaim umum seperti "semua sudah sempurna, siap production 🚀" tanpa bukti konkret) — user pernah menerima laporan seperti itu dan ternyata build-nya gagal total.
- Field naming API berbeda-beda antar endpoint (lihat bagian 3) — jangan pernah menyeragamkan/mengasumsikan tanpa mengecek kode aktual tiap file.
