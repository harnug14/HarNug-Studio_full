import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { chatWithGemini, ChatMessage } from "@/lib/gemini/chatWithGemini";
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
  const model: string = body?.model || session.model;
  const mode: string = body?.mode || session.mode;

  if (!pesanBaru && attachments.length === 0) {
    return NextResponse.json({ error: "Pesan atau lampiran tidak boleh kosong" }, { status: 400 });
  }

  const { data: riwayat } = await supabase
    .from("chat_messages")
    .select("role, content")
    .eq("session_id", id)
    .order("created_at", { ascending: true });

  const messages: any[] = (riwayat || []).map((m: any) => ({
    role: m.role,
    content: m.content,
  }));

  messages.push({
    role: "user",
    content: pesanBaru || (attachments.length > 0 ? "Berikut lampiran foto/file yang saya unggah." : ""),
    ...(attachments.length > 0 ? { attachments } : {}),
  });

  const userContent = pesanBaru || (attachments.length > 0 ? `[Lampiran: ${attachments.map((a: any) => a.name).join(", ")}]` : "");

  await supabase.from("chat_messages").insert({
    session_id: id,
    role: "user",
    content: userContent,
  });

  let jawaban: string;
  try {
    if (model.startsWith("groq-")) {
      jawaban = await callGroqWithRotation(supabase, (apiKey) =>
        chatWithGroq(
          messages as any,
          apiKey,
          model,
          mode as any,
          undefined,
          session.content_target || null
        )
      );
    } else {
      jawaban = await callGeminiWithRotation(supabase, (apiKey) =>
        chatWithGemini(
          messages as any,
          apiKey,
          model,
          mode as any,
          undefined,
          session.content_target || null
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

  if (model !== session.model || mode !== session.mode) {
    await supabase.from("chat_sessions").update({ model, mode }).eq("id", id);
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