"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
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

  async function handleBuy(batchId: string) {
    try {
      setErr(null);
      setBuyingBatchId(batchId);

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ batchId }),
      });

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
            {event.description ? (
              <p className="mt-4 text-white/80">{event.description}</p>
            ) : null}
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <h2 className="text-lg font-semibold">Billets</h2>

            {batches.length === 0 ? (
              <p className="mt-3 text-white/60">Aucun lot disponible.</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {batches.map((b) => {
                  const remaining = b.quantity_total - b.quantity_sold;
                  const soldOut = remaining <= 0;
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
                            {(b.price_cents / 100).toFixed(2)} {b.currency} · Restants:{" "}
                            {remaining}
                          </p>
                        </div>

                        <button
                          disabled={soldOut || isBuying}
                          className="rounded-xl bg-[#7A3CFF] px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
                          onClick={() => handleBuy(b.id)}
                        >
                          {soldOut ? "Complet" : isBuying ? "Redirection…" : "Acheter"}
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
