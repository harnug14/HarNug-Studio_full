import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { chatWithGemini } from "@/lib/gemini/chatWithGemini";
import { callGeminiWithRotation } from "@/lib/gemini/keyRotation";
import { chatWithGroq } from "@/lib/groq/chatWithGroq";
import { callGroqWithRotation } from "@/lib/groq/keyRotation";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Belum login" }, { status: 401 });
  }

  const { data: session, error: sessionError } = await supabase
    .from("chat_sessions")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (sessionError || !session) {
    return NextResponse.json({ error: "Sesi chat tidak ditemukan" }, { status: 404 });
  }

  const { data: messages, error: messagesError } = await supabase
    .from("chat_messages")
    .select("*")
    .eq("session_id", id)
    .order("created_at", { ascending: true });

  if (messagesError) {
    return NextResponse.json({ error: messagesError.message }, { status: 500 });
  }

  return NextResponse.json({ session, messages: messages || [] });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Belum login" }, { status: 401 });
  }

  const { data: session, error: sessionError } = await supabase
    .from("chat_sessions")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (sessionError || !session) {
    return NextResponse.json({ error: "Sesi chat tidak ditemukan" }, { status: 404 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch (err: any) {
    return NextResponse.json(
      { error: "Ukuran foto/file terlalu besar atau format request tidak valid." },
      { status: 400 }
    );
  }

  const pesanBaru: string = (body?.pesan || "").trim();
  const attachments: any[] = body?.attachments || [];
  const model: string = body?.model || session.model || "gemini-3.6-flash";
  
  // Tangkap mode & tombol Web Search secara fleksibel
  const rawMode: string = String(body?.mode || session.mode || "biasa");
  const isWebSearchOn = Boolean(
    rawMode.includes("search") ||
    body?.webSearch === true ||
    body?.isSearch === true ||
    rawMode === "search"
  );
  const modeToSend = isWebSearchOn ? "search" : rawMode;

  if (!pesanBaru && attachments.length === 0) {
    return NextResponse.json({ error: "Pesan atau lampiran tidak boleh kosong" }, { status: 400 });
  }

  const { data: riwayat } = await supabase
    .from("chat_messages")
    .select("role, content, attachments")
    .eq("session_id", id)
    .order("created_at", { ascending: true });

  const messages: any[] = (riwayat || []).map((m: any) => ({
    role: m.role,
    content: m.content,
    attachments: m.attachments || undefined,
  }));

  messages.push({
    role: "user",
    content: pesanBaru,
    ...(attachments.length > 0 ? { attachments } : {}),
  });

  await supabase.from("chat_messages").insert({
    session_id: id,
    role: "user",
    content: pesanBaru,
    attachments: attachments.map((a: any) => ({
      name: a.name,
      type: a.type,
      url: a.previewUrl || a.url || a.base64 || "",
    })),
  });

  let jawaban: string;
  try {
    if (model.startsWith("groq-")) {
      jawaban = await callGroqWithRotation(supabase, (apiKey) =>
        chatWithGroq(
          messages as any,
          apiKey,
          model,
          modeToSend as any
        )
      );
    } else {
      jawaban = await callGeminiWithRotation(supabase, (apiKey) =>
        chatWithGemini(
          messages as any,
          apiKey,
          model,
          modeToSend as any
        )
      );
    }
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Gagal mendapat jawaban dari AI" },
      { status: 500 }
    );
  }

  await supabase.from("chat_messages").insert({
    session_id: id,
    role: "assistant",
    content: jawaban,
  });

  if (model !== session.model || rawMode !== session.mode) {
    await supabase.from("chat_sessions").update({ model, mode: rawMode }).eq("id", id);
  }

  return NextResponse.json({ jawaban });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Belum login" }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch (err: any) {
    return NextResponse.json({ error: "Format JSON tidak valid" }, { status: 400 });
  }

  const judulBaru: string = (body?.judul || "").trim();

  if (!judulBaru) {
    return NextResponse.json({ error: "Judul tidak boleh kosong" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("chat_sessions")
    .update({ judul: judulBaru })
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message || "Sesi chat tidak ditemukan" },
      { status: 404 }
    );
  }

  return NextResponse.json({ data });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Belum login" }, { status: 401 });
  }

  const { error } = await supabase
    .from("chat_sessions")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
