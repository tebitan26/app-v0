"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useSessionProfile } from "../lib/useSessionProfile";

type EventRow = {
  id: string;
  title: string;
  city: string;
  venue_name: string | null;
  start_at: string;
  status: "DRAFT" | "PUBLISHED" | "CANCELLED";
  ticket_batches?: {
    quantity_total: number;
    quantity_sold: number;
    price_cents: number;
    currency: string;
  }[];
};

type RevenueKpiRow = {
  event_id: string;
  primary_ca_cents: number | null;
  secondary_fee_cents: number | null;
  total_ca_cents: number | null;
  primary_orders_paid: number | null;
  secondary_resales_sold: number | null;
};

export default function OrgPage() {
  const { loading, role } = useSessionProfile();
  const [events, setEvents] = useState<EventRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [kpisByEventId, setKpisByEventId] = useState<
    Record<string, RevenueKpiRow>
  >({});

  const [lastUpdatedTs, setLastUpdatedTs] = useState<number | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  function formatDateTime(iso: string) {
    const d = new Date(iso);
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

  const allowed = role === "ORGANIZER" || role === "ADMIN";
  const { upcomingEvents, pastEvents } = useMemo(() => {
    const nowTs = Date.now();
    const upcoming = events
      .filter((event) => new Date(event.start_at).getTime() >= nowTs)
      .sort(
        (a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime()
      );
    const past = events
      .filter((event) => new Date(event.start_at).getTime() < nowTs)
      .sort(
        (a, b) => new Date(b.start_at).getTime() - new Date(a.start_at).getTime()
      );
    return { upcomingEvents: upcoming, pastEvents: past };
  }, [events]);

  const PAGE_SIZE = 6;
  const [activeView, setActiveView] = useState<"upcoming" | "past">("upcoming");
  const [upcomingLimit, setUpcomingLimit] = useState(PAGE_SIZE);
  const [pastLimit, setPastLimit] = useState(PAGE_SIZE);

  function formatEUR(cents: number | null | undefined) {
    const value = typeof cents === "number" ? cents : 0;
    return `${(value / 100).toFixed(2)} EUR`;
  }

  const load = useCallback(async () => {
    if (!allowed) return;

    setLoadingEvents(true);
    setErr(null);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setErr("Non authentifié");
      setEvents([]);
      setKpisByEventId({});
      setLoadingEvents(false);
      return;
    }

    const { data, error } = await supabase
      .from("events")
      .select(
        "id,title,city,venue_name,start_at,status,ticket_batches(quantity_total,quantity_sold,price_cents,currency)"
      )
      .eq("organizer_id", user.id)
      .order("start_at", { ascending: true });

    if (error) {
      setErr(error.message);
      setEvents([]);
      setKpisByEventId({});
      setLoadingEvents(false);
      return;
    }

    const eventsData = (data ?? []) as EventRow[];
    setEvents(eventsData);

    const eventIds = eventsData.map((e) => e.id);

    if (eventIds.length === 0) {
      setKpisByEventId({});
      setLastUpdatedTs(Date.now());
      setLoadingEvents(false);
      return;
    }

    const { data: kpisData, error: kpisError } = await supabase
      .from("v_org_event_revenue_kpis")
      .select(
        "event_id,primary_ca_cents,secondary_fee_cents,total_ca_cents,primary_orders_paid,secondary_resales_sold"
      )
      // important: the view is already scoped by organizer_id
      .eq("organizer_id", user.id)
      .in("event_id", eventIds);

    if (kpisError) {
      setErr(kpisError.message);
      setKpisByEventId({});
      setLastUpdatedTs(Date.now());
      setLoadingEvents(false);
      return;
    }

    const map = (kpisData ?? []).reduce((acc, row) => {
      const r = row as RevenueKpiRow;
      acc[r.event_id] = r;
      return acc;
    }, {} as Record<string, RevenueKpiRow>);

    setKpisByEventId(map);
    setLastUpdatedTs(Date.now());
    setLoadingEvents(false);
  }, [allowed]);

  useEffect(() => {
    if (!allowed) return;
    load();
  }, [allowed, load, refreshKey]);

  if (loading) return <p className="text-white/70">Chargement…</p>;

  if (!allowed) {
    return (
      <section>
        <h1 className="text-3xl font-bold">Espace organisateur</h1>
        <p className="mt-4 text-white/80">Accès réservé aux organisateurs.</p>
        <Link
          href="/login"
          className="mt-6 inline-flex rounded-xl bg-[#7A3CFF] px-5 py-3 font-medium hover:opacity-90"
        >
          Se connecter
        </Link>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold">Dashboard organisateur</h1>
            <p className="mt-2 text-white/70">
              Crée un événement, ajoute des lots de billets, puis publie.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/org/staff"
              className="inline-flex rounded-xl border border-white/15 bg-white/5 px-5 py-3 font-medium hover:bg-white/10"
            >
              Gérer le staff
            </Link>
            <Link
              href="/org/logs"
              className="inline-flex rounded-xl border border-white/15 bg-white/5 px-5 py-3 font-medium hover:bg-white/10"
            >
              Logs &amp; Exports
            </Link>

            <Link
              href="/org/events/new"
              className="inline-flex rounded-xl bg-[#7A3CFF] px-5 py-3 font-medium hover:opacity-90"
            >
              + Créer un événement
            </Link>
          </div>
        </div>

        {err ? (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-200">
            {err}
          </div>
        ) : null}

        {/* View switch + quick counters */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <div className="inline-flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveView("upcoming")}
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                  activeView === "upcoming"
                    ? "border-white/20 bg-white/10 text-white"
                    : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
                }`}
              >
                À venir
                <span className="rounded-full border border-white/10 bg-black/20 px-2 py-0.5 text-[11px] text-white/70">
                  {upcomingEvents.length}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setActiveView("past")}
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                  activeView === "past"
                    ? "border-white/20 bg-white/10 text-white"
                    : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
                }`}
              >
                Passés
                <span className="rounded-full border border-white/10 bg-black/20 px-2 py-0.5 text-[11px] text-white/70">
                  {pastEvents.length}
                </span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => setRefreshKey((k) => k + 1)}
              disabled={loadingEvents}
              className="ml-0 inline-flex items-center justify-center rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/80 hover:bg-white/10 disabled:opacity-60 sm:ml-2"
              aria-label="Rafraîchir les données"
            >
              {loadingEvents ? "Chargement…" : "Rafraîchir"}
            </button>
          </div>

          <div className="flex flex-col items-start gap-1 text-xs text-white/60 sm:items-end">
            <div>
              {activeView === "upcoming"
                ? "Vue : événements à venir (opérations & publication)"
                : "Vue : événements passés (revenus & volumes)"}
            </div>
            {lastUpdatedTs ? (
              <div className="text-white/40">
                Mis à jour : {new Date(lastUpdatedTs).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
              </div>
            ) : null}
          </div>
        </div>

        {/* UPCOMING */}
        {activeView === "upcoming" ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
              <h2 className="text-lg font-semibold">Événements à venir</h2>
              <p className="text-sm text-white/70">
                Actions : vérifier la config, publier, gérer le staff.
              </p>
            </div>

            {loadingEvents ? (
              <p className="mt-3 text-white/60">Chargement…</p>
            ) : upcomingEvents.length === 0 ? (
              <p className="mt-3 text-white/60">Aucun événement à venir</p>
            ) : (
              <>
                <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                  {upcomingEvents.slice(0, upcomingLimit).map((e) => (
                    <li
                      key={e.id}
                      className="rounded-2xl border border-white/10 bg-black/20 p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate font-medium text-white">{e.title}</p>
                            <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-xs text-white/70">
                              {e.status}
                            </span>
                          </div>
                          <p className="mt-1 text-sm text-white/60">
                            {formatDateTime(e.start_at)} · {e.city}
                            {e.venue_name ? ` · ${e.venue_name}` : ""}
                          </p>

                          <p className="mt-2 text-sm text-white/60">
                            {(() => {
                              const batches = e.ticket_batches ?? [];
                              const sold = batches.reduce(
                                (acc, b) => acc + (b.quantity_sold ?? 0),
                                0
                              );
                              const cap = batches.reduce(
                                (acc, b) => acc + (b.quantity_total ?? 0),
                                0
                              );
                              const grossCents = batches.reduce(
                                (acc, b) =>
                                  acc + (b.quantity_sold ?? 0) * (b.price_cents ?? 0),
                                0
                              );
                              const currency = batches[0]?.currency ?? "EUR";
                              const gross = (grossCents / 100).toFixed(2);
                              return cap > 0
                                ? `Vendus: ${sold} / ${cap} · CA (brut): ${gross} ${currency}`
                                : `Vendus: ${sold} · CA (brut): ${gross} ${currency}`;
                            })()}
                          </p>
                        </div>

                        <Link
                          href={`/org/events/${e.id}`}
                          className="shrink-0 rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm hover:bg-white/10"
                        >
                          Gérer
                        </Link>
                      </div>
                    </li>
                  ))}
                </ul>

                {upcomingEvents.length > upcomingLimit ? (
                  <div className="mt-4 flex justify-center">
                    <button
                      type="button"
                      onClick={() => setUpcomingLimit((n) => n + PAGE_SIZE)}
                      className="inline-flex items-center justify-center rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium hover:bg-white/10"
                    >
                      Afficher {Math.min(PAGE_SIZE, upcomingEvents.length - upcomingLimit)} de plus
                    </button>
                  </div>
                ) : null}
              </>
            )}
          </div>
        ) : null}

        {/* PAST */}
        {activeView === "past" ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
              <h2 className="text-lg font-semibold">Événements passés</h2>
              <p className="text-sm text-white/70">
                Lecture rapide : primaire (ventes payées), secondaire (frais de revente), total.
              </p>
            </div>

            {loadingEvents ? (
              <p className="mt-3 text-white/60">Chargement…</p>
            ) : pastEvents.length === 0 ? (
              <p className="mt-3 text-white/60">Aucun événement passé</p>
            ) : (
              <>
                <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                  {pastEvents.slice(0, pastLimit).map((e) => (
                    <li key={e.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate font-medium text-white">{e.title}</p>
                            <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-xs text-white/70">
                              {e.status}
                            </span>
                          </div>
                          <p className="mt-1 text-sm text-white/60">
                            {formatDateTime(e.start_at)} · {e.city}
                            {e.venue_name ? ` · ${e.venue_name}` : ""}
                          </p>

                          <div className="mt-3 grid gap-3 sm:grid-cols-3">
                            {(() => {
                              const kpi = kpisByEventId[e.id];
                              const hasKpi = Boolean(kpi);
                              const primaryCount = kpi?.primary_orders_paid ?? 0;
                              const resaleCount = kpi?.secondary_resales_sold ?? 0;
                              const primary = hasKpi ? formatEUR(kpi?.primary_ca_cents) : "—";
                              const secondary = hasKpi ? formatEUR(kpi?.secondary_fee_cents) : "—";
                              const total = hasKpi ? formatEUR(kpi?.total_ca_cents) : "—";

                            const Stat = ({
                              label,
                              value,
                              sub,
                              emphasis,
                            }: {
                              label: string;
                              value: string;
                              sub?: string;
                              emphasis?: boolean;
                            }) => (
                              <div
                                className={`rounded-xl border border-white/10 bg-white/5 p-3 ${
                                  emphasis ? "ring-1 ring-[#7A3CFF]/30 bg-[#7A3CFF]/10" : ""
                                }`}
                              >
                                <div className="text-[11px] uppercase tracking-wide text-white/50">
                                  {label}
                                </div>
                                <div className={`mt-1 font-semibold text-white ${emphasis ? "text-2xl" : "text-lg"}`}>
                                  {value}
                                </div>
                                {sub ? (
                                  <div className="mt-1 text-xs text-white/60">{sub}</div>
                                ) : null}
                              </div>
                            );

                            return (
                              <>
                                <Stat
                                  label="Total gagné"
                                  value={total}
                                  sub={hasKpi ? "Primaire + frais (10%)" : "Données en cours"}
                                  emphasis
                                />
                                <Stat
                                  label="Ventes primaires"
                                  value={primary}
                                  sub={`${primaryCount} vente${primaryCount > 1 ? "s" : ""} payée${primaryCount > 1 ? "s" : ""}`}
                                />
                                <Stat
                                  label="Frais reventes"
                                  value={secondary}
                                  sub={`${resaleCount} revente${resaleCount > 1 ? "s" : ""} vendue${resaleCount > 1 ? "s" : ""}`}
                                />
                              </>
                            );
                            })()}
                          </div>
                        </div>

                        <div className="shrink-0">
                          <Link
                            href={`/org/events/${e.id}`}
                            className="inline-flex w-full items-center justify-center rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm hover:bg-white/10 sm:w-auto"
                          >
                            Gérer
                          </Link>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>

                {pastEvents.length > pastLimit ? (
                  <div className="mt-4 flex justify-center">
                    <button
                      type="button"
                      onClick={() => setPastLimit((n) => n + PAGE_SIZE)}
                      className="inline-flex items-center justify-center rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium hover:bg-white/10"
                    >
                      Afficher {Math.min(PAGE_SIZE, pastEvents.length - pastLimit)} de plus
                    </button>
                  </div>
                ) : null}
              </>
            )}
          </div>
        ) : null}
      </div>
    </section>
  );
}
