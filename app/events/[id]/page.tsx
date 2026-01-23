"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";

type EventRow = {
  id: string;
  title: string;
  description: string | null;
  city: string;
  venue_name: string | null;
  start_at: string;
  status: "DRAFT" | "PUBLISHED" | "CANCELLED";
};

type BatchRow = {
  id: string;
  event_id: string;
  name: string;
  price_cents: number;
  currency: string;
  quantity_total: number;
  quantity_sold: number;
};

export default function FanEventPage() {
  const params = useParams();
  const eventId = useMemo(() => {
    const raw = (params as any)?.id;
    return Array.isArray(raw) ? raw[0] : (raw as string | undefined);
  }, [params]);
  const router = useRouter();
  const searchParams = useSearchParams();
  const autoBuyTriggeredRef = useRef<string | null>(null);

  const [event, setEvent] = useState<EventRow | null>(null);
  const [batches, setBatches] = useState<BatchRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [buyingBatchId, setBuyingBatchId] = useState<string | null>(null);

  useEffect(() => {
    if (!eventId) return;

    (async () => {
      setLoading(true);
      setErr(null);

      const { data: ev, error: evErr } = await supabase
        .from("events")
        .select("id,title,description,city,venue_name,start_at,status")
        .eq("id", eventId)
        .eq("status", "PUBLISHED")
        .single();

      if (evErr) {
        setErr(evErr.message);
        setEvent(null);
        setBatches([]);
        setLoading(false);
        return;
      }

      const { data: bt, error: btErr } = await supabase
        .from("ticket_batches")
        .select("id,event_id,name,price_cents,currency,quantity_total,quantity_sold")
        .eq("event_id", eventId)
        .order("created_at", { ascending: true });

      if (btErr) setErr(btErr.message);

      setEvent(ev as EventRow);
      setBatches((bt ?? []) as BatchRow[]);
      setLoading(false);
    })();
  }, [eventId]);

  // Auto-reprendre l'achat après un retour de /login (OAuth / magic link)
  useEffect(() => {
    const autoBuy = searchParams.get("autoBuy") === "1";
    const batchId = searchParams.get("batchId");

    // If there's no autoBuy intent, nothing to do.
    if (!autoBuy || !batchId) return;

    // Prevent double-trigger across re-renders.
    if (autoBuyTriggeredRef.current === batchId) return;
    autoBuyTriggeredRef.current = batchId;

    (async () => {
      try {
        // Ensure we have a session first (cookies should already be set by /auth/callback).
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData?.session?.access_token;

        // If not logged in yet, keep the URL as-is so handleBuy can send the user back to login
        // while preserving the intent and batchId.
        if (!token) return;

        // Clean the URL so refresh doesn't re-trigger autoBuy.
        const clean = new URL(window.location.href);
        clean.searchParams.delete("autoBuy");
        clean.searchParams.delete("batchId");
        clean.searchParams.delete("fromAuth");
        router.replace(`${clean.pathname}${clean.search}`);

        // Trigger checkout.
        await handleBuy(batchId);
      } catch (e: any) {
        setErr(e?.message ?? "Erreur auto-achat");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, router]);

  async function handleBuy(batchId: string) {
    try {
      setErr(null);
      setBuyingBatchId(batchId);

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      // Extra safety: validate that we actually have a user.
      // In some edge cases (stale storage / missing refresh token), getSession can be non-null
      // but the session isn't usable server-side.
      const { data: userData, error: userErr } = await supabase.auth.getUser();

      // Not logged in (or session not valid): send to /login and come back to this event page after auth
      if (!token || userErr || !userData?.user) {
        // Clean up any broken client state so we don't loop on invalid tokens
        await supabase.auth.signOut();

        const nextUrl = `${window.location.pathname}${window.location.search}`;
        const loginUrl = `/login?next=${encodeURIComponent(
          nextUrl
        )}&intent=buy&batchId=${encodeURIComponent(batchId)}`;
        router.push(loginUrl);
        return;
      }

      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ batchId }),
      });

      // If the API says we're not authorized, treat it like "not logged in" and resume after login.
      if (res.status === 401) {
        await supabase.auth.signOut();
        const nextUrl = `${window.location.pathname}${window.location.search}`;
        const loginUrl = `/login?next=${encodeURIComponent(
          nextUrl
        )}&intent=buy&batchId=${encodeURIComponent(batchId)}`;
        router.push(loginUrl);
        return;
      }

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json?.error || `Checkout failed (${res.status})`);
      }

      if (!json?.url) {
        throw new Error("No checkout URL returned.");
      }

      window.location.href = json.url;
    } catch (e: any) {
      setErr(e?.message ?? "Erreur checkout");
    } finally {
      setBuyingBatchId(null);
    }
  }

  return (
    <section className="space-y-6">
      <Link href="/events" className="text-sm text-white/70 hover:text-white">
        ← Retour aux événements
      </Link>

      {err ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-200">
          {err}
        </div>
      ) : null}

      {loading && !event ? (
        <p className="text-white/60">Chargement…</p>
      ) : !event ? (
        <p className="text-white/60">Événement introuvable (ou pas publié).</p>
      ) : (
        <>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <h1 className="text-3xl font-bold">{event.title}</h1>
            <p className="mt-2 text-white/70">
              {new Date(event.start_at).toLocaleString()} · {event.city}
              {event.venue_name ? ` · ${event.venue_name}` : ""}
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-white/70">
              <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1">
                Paiement sécurisé
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1">
                Billet authentique
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1">
                Revente officielle possible
              </span>
            </div>
            {event.description ? (
              <p className="mt-4 text-white/80">{event.description}</p>
            ) : null}
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <h2 className="text-lg font-semibold">Billets</h2>
            <p className="mt-2 text-sm text-white/70">
              Choisissez un lot — l’achat démarre en un clic.
            </p>

            {batches.length === 0 ? (
              <p className="mt-3 text-white/60">Aucun lot disponible.</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {batches.map((b) => {
                  const remaining = b.quantity_total - b.quantity_sold;
                  const soldOut = remaining <= 0;
                  const lowStock = remaining > 0 && remaining <= 5;
                  const isBuying = buyingBatchId === b.id;

                  return (
                    <li
                      key={b.id}
                      className="rounded-xl border border-white/10 bg-black/20 p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium">{b.name}</p>
                          <p className="mt-1 text-sm text-white/60">
                            {(b.price_cents / 100).toFixed(2)} {b.currency} ·{" "}
                            {soldOut ? "Complet" : `Restants : ${remaining}`}
                            {lowStock ? (
                              <span className="ml-2 text-xs text-white/80">
                                (plus que {remaining})
                              </span>
                            ) : null}
                          </p>
                        </div>

                        <button
                          disabled={soldOut || isBuying}
                          className="rounded-xl bg-[#7A3CFF] px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
                          onClick={() => handleBuy(b.id)}
                        >
                          {soldOut ? "Complet" : isBuying ? "Redirection vers le paiement…" : "Acheter mon billet"}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      )}
    </section>
  );
}
