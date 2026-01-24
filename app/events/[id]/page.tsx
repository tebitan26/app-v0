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

function formatMoney(priceCents: number, currency?: string) {
  const value = (priceCents ?? 0) / 100;
  try {
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: currency || "EUR",
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency || "EUR"}`;
  }
}

function formatEventDate(startAtIso: string) {
  const d = new Date(startAtIso);
  if (Number.isNaN(d.getTime())) return "Date à confirmer";
  return d.toLocaleString("fr-FR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatCountdownToStart(startAtIso: string | null | undefined, nowTs: number) {
  if (!startAtIso) return null;
  const start = new Date(startAtIso);
  if (Number.isNaN(start.getTime())) return null;

  const diffMs = start.getTime() - nowTs;
  if (diffMs <= 0) return "En cours";

  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);

  if (diffHr < 24) {
    const h = diffHr;
    const m = diffMin % 60;
    return `${h}h ${String(m).padStart(2, "0")}m`;
  }

  const days = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  return `${days} j`;
}

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
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);

  const [nowTs, setNowTs] = useState(() => Date.now());

  useEffect(() => {
    const t = window.setInterval(() => setNowTs(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

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

      // Preselect first available batch (conversion)
      const firstAvailable = (bt ?? []).find((b: any) => (b.quantity_total - b.quantity_sold) > 0);
      setSelectedBatchId(firstAvailable?.id ?? null);

      setLoading(false);
    })();
  }, [eventId]);

  const startAt = event?.start_at ? new Date(event.start_at) : null;
  const isEventPast = Boolean(startAt && nowTs > startAt.getTime() + 2 * 60 * 60 * 1000);
  const countdown = event?.start_at ? formatCountdownToStart(event.start_at, nowTs) : null;

  const selectedBatch = useMemo(() => {
    if (!selectedBatchId) return null;
    return batches.find((b) => b.id === selectedBatchId) ?? null;
  }, [batches, selectedBatchId]);

  // Auto-reprendre l'achat après un retour de /login (OAuth / magic link)
  useEffect(() => {
    const autoBuy = searchParams.get("autoBuy") === "1";
    const batchId = searchParams.get("batchId");

    if (!autoBuy || !batchId) return;
    if (autoBuyTriggeredRef.current === batchId) return;
    autoBuyTriggeredRef.current = batchId;

    (async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData?.session?.access_token;

        if (!token) return;

        const clean = new URL(window.location.href);
        clean.searchParams.delete("autoBuy");
        clean.searchParams.delete("batchId");
        clean.searchParams.delete("fromAuth");
        router.replace(`${clean.pathname}${clean.search}`);

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

      const { data: userData, error: userErr } = await supabase.auth.getUser();

      if (!token || userErr || !userData?.user) {
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/events" className="text-sm text-white/70 hover:text-white">
          ← Retour aux événements
        </Link>
        <Link
          href="/marketplace"
          className="text-sm text-white/70 hover:text-white"
        >
          Voir la marketplace →
        </Link>
      </div>

      {err ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-200">
          {err}
        </div>
      ) : null}

      {loading && !event ? (
        <p className="text-white/60">Chargement…</p>
      ) : !event ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-7">
          <h1 className="text-2xl font-bold">Événement introuvable</h1>
          <p className="mt-2 text-white/70">
            Cet événement n’existe pas, ou n’est pas publié.
          </p>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/events"
              className="inline-flex items-center justify-center rounded-xl bg-[#7A3CFF] px-4 py-2 text-sm font-medium hover:opacity-90"
            >
              Voir les événements
            </Link>
            <Link
              href="/marketplace"
              className="inline-flex items-center justify-center rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium hover:bg-white/10"
            >
              Marketplace
            </Link>
          </div>
        </div>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
            {/* HERO */}
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h1 className="text-3xl font-bold">{event.title}</h1>
                  <p className="mt-2 text-white/70">
                    {event.start_at ? formatEventDate(event.start_at) : "Date à confirmer"} · {event.city}
                    {event.venue_name ? ` · ${event.venue_name}` : ""}
                  </p>
                </div>

                <div className="flex flex-col items-start gap-2">
                  {isEventPast ? (
                    <span className="rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1 text-xs font-semibold text-red-200">
                      Terminé
                    </span>
                  ) : countdown ? (
                    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-white/80">
                      {countdown === "En cours" ? "En cours" : `Débute dans ${countdown}`}
                    </span>
                  ) : null}

                  <div className="flex flex-wrap gap-2 text-xs text-white/70">
                    <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1">
                      Paiement Stripe
                    </span>
                    <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1">
                      Billet authentique
                    </span>
                    <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1">
                      Revente officielle
                    </span>
                  </div>
                </div>
              </div>

              {event.description ? (
                <p className="mt-4 text-white/80">{event.description}</p>
              ) : (
                <p className="mt-4 text-white/70">
                  Billetterie officielle Sidetick : achat simple, contrôle anti-fraude, et revente encadrée.
                </p>
              )}
            </div>

            {/* TRUST / INFO */}
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
              <h2 className="text-base font-semibold">Ce que tu achètes</h2>
              <ul className="mt-3 space-y-2 text-sm text-white/70">
                <li className="flex gap-2">
                  <span className="mt-0.5 text-white/60">•</span>
                  <span>Un billet nominatif et traçable dans ton compte.</span>
                </li>
                <li className="flex gap-2">
                  <span className="mt-0.5 text-white/60">•</span>
                  <span>
                    QR anti-fraude affiché avant l’événement (ex : <span className="text-white">T-2h</span>).
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="mt-0.5 text-white/60">•</span>
                  <span>
                    Revente officielle : prix plafonné + frais (10%).
                  </span>
                </li>
              </ul>

              <div className="mt-5 rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-white/70">
                {isEventPast ? (
                  <span>
                    Événement terminé — les achats sont désactivés. Tu peux consulter la marketplace ou d’autres événements.
                  </span>
                ) : (
                  <span>
                    Achat en 1 clic : si tu n’es pas connecté, tu seras redirigé vers la connexion puis tu reviendras ici automatiquement.
                  </span>
                )}
              </div>

              <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/events"
                  className="inline-flex items-center justify-center rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium hover:bg-white/10"
                >
                  Voir les événements
                </Link>
                <Link
                  href="/marketplace"
                  className="inline-flex items-center justify-center rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium hover:bg-white/10"
                >
                  Marketplace
                </Link>
              </div>
            </div>
          </div>

          {/* TICKETS */}
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold">Billets</h2>
                <p className="mt-1 text-sm text-white/70">
                  Choisis un lot — paiement sécurisé, puis billet visible dans « Mes billets ».
                </p>
              </div>
            </div>

            {batches.length === 0 ? (
              <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4 text-white/70">
                Aucun lot disponible.
              </div>
            ) : (
              <div className="mt-4 grid gap-3">
                {batches.map((b) => {
                  const remaining = b.quantity_total - b.quantity_sold;
                  const soldOut = remaining <= 0;
                  const lowStock = remaining > 0 && remaining <= 5;
                  const isBuying = buyingBatchId === b.id;
                  const selected = selectedBatchId === b.id;

                  return (
                    <div
                      key={b.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedBatchId(b.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSelectedBatchId(b.id);
                        }
                      }}
                      className={`group w-full cursor-pointer rounded-2xl border bg-black/20 p-4 text-left transition hover:bg-black/25 ${
                        selected ? "border-[#7A3CFF]/60 ring-1 ring-[#7A3CFF]/40" : "border-white/10"
                      }`}
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate text-base font-semibold text-white">{b.name}</p>
                            {soldOut ? (
                              <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-xs text-white/70">
                                Complet
                              </span>
                            ) : lowStock ? (
                              <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-xs text-white/80">
                                Plus que {remaining}
                              </span>
                            ) : (
                              <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-xs text-white/70">
                                {remaining} restants
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-sm text-white/70">
                            {formatMoney(b.price_cents, b.currency)}
                            <span className="text-white/40"> · </span>
                            Billet officiel Sidetick
                          </p>
                        </div>

                        <div className="flex flex-col items-start gap-2 sm:items-end">
                          <span className={`text-xs ${selected ? "text-[#C7B5FF]" : "text-white/60"}`}>
                            {selected ? "Sélectionné" : "Cliquer pour sélectionner"}
                          </span>
                          <span className="text-xs text-white/50">Paiement sécurisé</span>
                        </div>
                      </div>

                      {selected ? (
                        <div className="mt-3 flex flex-wrap items-center gap-3">
                          <button
                            type="button"
                            disabled={soldOut || isBuying || isEventPast}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleBuy(b.id);
                            }}
                            className="inline-flex items-center justify-center rounded-xl bg-[#7A3CFF] px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
                          >
                            {isEventPast
                              ? "Événement terminé"
                              : soldOut
                              ? "Complet"
                              : isBuying
                              ? "Redirection vers le paiement…"
                              : "Acheter mon billet"}
                          </button>

                          {!isEventPast && !soldOut ? (
                            <span className="text-xs text-white/60">
                              Tu seras redirigé vers Stripe.
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Sticky CTA (mobile) */}
          {selectedBatch && batches.length > 0 && !isEventPast ? (
            <div className="fixed inset-x-0 bottom-0 z-20 border-t border-white/10 bg-[#0B0018]/85 backdrop-blur md:hidden">
              <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-white">
                    {selectedBatch.name}
                  </div>
                  <div className="text-xs text-white/70">
                    {formatMoney(selectedBatch.price_cents, selectedBatch.currency)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleBuy(selectedBatch.id)}
                  disabled={
                    buyingBatchId === selectedBatch.id ||
                    (selectedBatch.quantity_total - selectedBatch.quantity_sold) <= 0
                  }
                  className="shrink-0 rounded-xl bg-[#7A3CFF] px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
                >
                  {buyingBatchId === selectedBatch.id ? "…" : "Acheter"}
                </button>
              </div>
            </div>
          ) : null}

          {/* spacing for sticky bar */}
          <div className="h-16 md:hidden" />
        </>
      )}
    </section>
  );
}
