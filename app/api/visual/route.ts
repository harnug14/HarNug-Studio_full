import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

export async function GET() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Belum login" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("visual")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Belum login" }, { status: 401 });
  }

  const body = await req.json();
  const judul = (body?.judul || "").trim();
  const isi_visual = body?.isi_visual || null;
  const sumber_naskah_id = body?.sumber_naskah_id || null;

  if (!judul) {
    return NextResponse.json({ error: "Judul visual wajib diisi" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("visual")
    .insert({
      user_id: user.id,
      judul,
      isi_visual,
      sumber_naskah_id,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}