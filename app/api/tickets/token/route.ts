export const runtime = "nodejs";

import { NextResponse } from "next/server";
import crypto from "crypto";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { supabaseAdmin } from "@/app/lib/supabaseAdmin";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const ticketId =
      url.searchParams.get("ticketId") ?? url.searchParams.get("ticket_id");

    if (!ticketId) {
      return NextResponse.json({ error: "missing_ticket_id" }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      console.error("[tickets/token] missing_supabase_env", {
        hasUrl: Boolean(supabaseUrl),
        hasAnon: Boolean(supabaseAnonKey),
      });
      return NextResponse.json({ error: "missing_supabase_env" }, { status: 500 });
    }

    // ------------------------------------------------------------
    // Auth strategy:
    // 1) Bearer access token (preferred)
    // 2) Cookie session fallback
    // ------------------------------------------------------------
    let authedUserId: string | null = null;

    // 1) Bearer token
    const authHeader = req.headers.get("authorization") || "";
    const bearer = authHeader.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length).trim()
      : null;

    if (bearer) {
      const { data, error } = await supabaseAdmin.auth.getUser(bearer);
      if (error) {
        console.warn("[tickets/token] bearer invalid", error.message);
      } else if (data?.user?.id) {
        authedUserId = data.user.id;
      }
    }

    // 2) Cookie fallback
    if (!authedUserId) {
      // In Next.js 15/16, cookies() can be async in Route Handlers.
      // We `await` it to avoid TS errors and to ensure we read the request cookies.
      const cookieStore = (await cookies()) as any;

      const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
        cookies: {
          getAll: () => cookieStore.getAll(),
          setAll: (toSet) => {
            // Route handlers may expose a read-only cookie store in some runtimes.
            // For our V0 use-case, we try to set when available.
            if (typeof cookieStore.set !== "function") return;
            toSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          },
        },
      });

      // Prefer session -> user
      const { data: sessionData } = await supabase.auth.getSession();
      if (sessionData?.session?.user?.id) {
        authedUserId = sessionData.session.user.id;
      } else {
        const { data: userData, error: userErr } = await supabase.auth.getUser();
        if (!userErr && userData?.user?.id) {
          authedUserId = userData.user.id;
        }
      }
    }

    if (!authedUserId) {
      console.warn("[tickets/token] not_authenticated", {
        hasAuthHeader: Boolean(authHeader),
        hasBearer: Boolean(bearer),
      });
      return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
    }

    // ------------------------------------------------------------
    // Ownership check
    // ------------------------------------------------------------
    const { data: ticket, error: ticketErr } = await supabaseAdmin
      .from("tickets")
      .select("id,owner_id")
      .eq("id", ticketId)
      .single();

    if (ticketErr) {
      console.error("[tickets/token] ticket lookup error", ticketErr.message);
      return NextResponse.json({ error: "ticket_lookup_failed" }, { status: 500 });
    }

    if (!ticket) {
      return NextResponse.json({ error: "ticket_not_found" }, { status: 404 });
    }

    if ((ticket as any).owner_id !== authedUserId) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    // ------------------------------------------------------------
    // Create short-lived rotating token
    // ------------------------------------------------------------
    const token = crypto.randomUUID();
    const expiresAtIso = new Date(Date.now() + 90 * 1000).toISOString();

    const { data: stored, error: tokenErr } = await supabaseAdmin
      .from("ticket_tokens")
      .upsert(
        { ticket_id: ticket.id, token, expires_at: expiresAtIso },
        { onConflict: "ticket_id" }
      )
      .select("token,expires_at")
      .single();

    if (tokenErr) {
      console.error("[tickets/token] upsert token error", tokenErr.message);
      return NextResponse.json({ error: tokenErr.message }, { status: 500 });
    }

    const finalToken = stored?.token ?? token;
    const finalExpiresAt = stored?.expires_at ?? expiresAtIso;

    return NextResponse.json({
      token: finalToken,
      expires_at: finalExpiresAt,
      exp: new Date(finalExpiresAt).getTime(),
    });
  } catch (e: any) {
    console.error("[tickets/token] UNHANDLED", e);
    return NextResponse.json(
      { error: "internal_error", detail: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}