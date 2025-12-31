export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { supabaseAdmin } from "@/app/lib/supabaseAdmin";

export async function POST(req: Request) {
  const { token } = await req.json().catch(() => ({}));
  if (!token) return NextResponse.json({ error: "missing_token" }, { status: 400 });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json({ error: "missing_supabase_env" }, { status: 500 });
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
      },
    },
  });

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const nowIso = new Date().toISOString();
  const { data: tokenRow, error: tokenErr } = await supabaseAdmin
    .from("ticket_tokens")
    .select("id,token,expires_at,ticket_id,tickets(id,used_at)")
    .eq("token", token)
    .gt("expires_at", nowIso)
    .single();

  if (tokenErr || !tokenRow) {
    return NextResponse.json({ error: "invalid_token" }, { status: 401 });
  }

  const ticket = Array.isArray((tokenRow as any).tickets)
    ? (tokenRow as any).tickets[0]
    : (tokenRow as any).tickets;

  if (!ticket?.id) {
    return NextResponse.json({ error: "ticket_not_found" }, { status: 404 });
  }

  if (ticket.used_at) {
    return NextResponse.json({ ok: false, reason: "already_used", used_at: ticket.used_at });
  }

  const usedAt = new Date().toISOString();
  const { data: updated, error: upErr } = await supabaseAdmin
    .from("tickets")
    .update({ used_at: usedAt, status: "USED" })
    .eq("id", ticket.id)
    .is("used_at", null)
    .select("id,used_at")
    .single();

  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  if (!updated) {
    return NextResponse.json({ ok: false, reason: "already_used" });
  }

  await supabaseAdmin.from("ticket_tokens").delete().eq("id", tokenRow.id);

  return NextResponse.json({ ok: true });
}
