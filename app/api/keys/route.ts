import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { NextRequest, NextResponse } from "next/server";

// Cek apakah key seharusnya sudah reset (jam 16:00 WIB) walau DB belum sempat diupdate cron
function shouldBeActiveByNow(lastCheckedAt: string | null): boolean {
  if (!lastCheckedAt) return false;

  const now = new Date();
  const wibFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  });

  const nowParts = wibFormatter.formatToParts(now);
  const nowDate = `${nowParts.find((p) => p.type === "year")?.value}-${nowParts.find((p) => p.type === "month")?.value}-${nowParts.find((p) => p.type === "day")?.value}`;
  const nowHour = parseInt(nowParts.find((p) => p.type === "hour")?.value || "0");

  const lastCheckedDate = new Date(lastCheckedAt);
  const lcParts = wibFormatter.formatToParts(lastCheckedDate);
  const lcDate = `${lcParts.find((p) => p.type === "year")?.value}-${lcParts.find((p) => p.type === "month")?.value}-${lcParts.find((p) => p.type === "day")?.value}`;

  // Aktif kalau: last_checked_at tanggalnya sebelum hari ini, DAN sekarang sudah lewat jam 16 WIB
  return lcDate < nowDate && nowHour >= 16;
}

// GET: ambil semua API key milik user yang sedang login
export async function GET() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("api_keys")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Overlay: kalau status masih "limited" di DB tapi sudah lewat jam reset, tampilkan "active"
  const patched = (data || []).map((key) => {
    if (key.status === "limited" && shouldBeActiveByNow(key.last_checked_at)) {
      return { ...key, status: "active", _autoResetDisplay: true };
    }
    return key;
  });

  return NextResponse.json({ data: patched });
}

// POST: tambah API key baru
export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { provider, key_label, api_key } = body;

  if (!provider || !key_label || !api_key) {
    return NextResponse.json({ error: "Data tidak lengkap" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("api_keys")
    .insert({ provider, key_label, api_key, user_id: user.id, status: "active" })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}

// DELETE: hapus API key berdasarkan id
export async function DELETE(request: NextRequest) {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "id wajib diisi" }, { status: 400 });
  }

  const { error } = await supabase.from("api_keys").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}