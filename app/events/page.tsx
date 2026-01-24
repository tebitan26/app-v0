"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";

type EventRow = {
  id: string;
  title: string;
  city: string;
  venue_name: string | null;
  start_at: string;
};

type TimeFilter = "all" | "7d" | "30d";

function safeDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function formatDate(iso: string) {
  const d = safeDate(iso);
  if (!d) return "Date à confirmer";
  return d.toLocaleString("fr-FR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatStartsIn(iso: string, nowTs: number) {
  const start = safeDate(iso);
  if (!start) return null;

  const diffMs = start.getTime() - nowTs;
  if (diffMs <= 0) return "En cours";

  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const days = Math.floor(diffHr / 24);

  if (days >= 1) return `Dans ${days} j`;
  const h = diffHr;
  const m = diffMin % 60;
  return `Dans ${h}h ${String(m).padStart(2, "0")}m`;
}

export default function EventsPage() {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("all");
  const [nowTs, setNowTs] = useState(() => Date.now());

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);

    try {
      // On garde les events à venir (tolérance de 2h)
      const cutoffIso = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from("events")
        .select("id,title,city,venue_name,start_at")
        .eq("status", "PUBLISHED")
        .gte("start_at", cutoffIso)
        .order("start_at", { ascending: true });

      if (error) {
        setErr(error.message || "Erreur de chargement.");
        setEvents([]);
        return;
      }

      setEvents((data ?? []) as EventRow[]);
    } catch {
      setErr("Erreur réseau.");
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Tick for countdown chips
  useEffect(() => {
    const t = window.setInterval(() => setNowTs(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    const maxTs =
      timeFilter === "7d"
        ? nowTs + 7 * 24 * 60 * 60 * 1000
        : timeFilter === "30d"
        ? nowTs + 30 * 24 * 60 * 60 * 1000
        : null;

    return events.filter((e) => {
      const start = safeDate(e.start_at);
      if (maxTs && start && start.getTime() > maxTs) return false;

      if (!q) return true;
      const hay = `${e.title ?? ""} ${e.city ?? ""} ${e.venue_name ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [events, query, timeFilter, nowTs]);

  const resultsLabel = useMemo(() => {
    if (loading) return "";
    const n = filtered.length;
    if (n === 0) return "0 événement";
    if (n === 1) return "1 événement";
    return `${n} événements`;
  }, [filtered.length, loading]);

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold">Événements</h1>
          <p className="text-white/70">
            Choisis un événement, puis achète ton billet en quelques secondes.
          </p>
          {resultsLabel ? (
            <div className="text-xs text-white/50">{resultsLabel}</div>
          ) : null}
        </div>

        <div className="flex w-full flex-col gap-2 sm:w-auto">
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative w-full sm:w-[360px]">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Rechercher (titre, ville, salle)"
                className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-2 pr-10 text-sm text-white placeholder:text-white/40 outline-none focus:border-white/25"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg border border-white/10 bg-black/20 px-2 py-1 text-xs text-white/70 hover:bg-black/30"
                  aria-label="Effacer la recherche"
                >
                  ✕
                </button>
              ) : null}
            </div>

            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="inline-flex items-center justify-center rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-white hover:bg-white/10 disabled:opacity-60"
            >
              {loading ? "Chargement…" : "Rafraîchir"}
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setTimeFilter("all")}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                timeFilter === "all"
                  ? "bg-[#7A3CFF]/25 text-[#C7B5FF]"
                  : "border border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
              }`}
            >
              Tous
            </button>
            <button
              type="button"
              onClick={() => setTimeFilter("7d")}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                timeFilter === "7d"
                  ? "bg-[#7A3CFF]/25 text-[#C7B5FF]"
                  : "border border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
              }`}
            >
              7 jours
            </button>
            <button
              type="button"
              onClick={() => setTimeFilter("30d")}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                timeFilter === "30d"
                  ? "bg-[#7A3CFF]/25 text-[#C7B5FF]"
                  : "border border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
              }`}
            >
              30 jours
            </button>
          </div>
        </div>
      </div>

      {err ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-200">
          <div>{err}</div>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="mt-3 inline-flex items-center justify-center rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-white hover:bg-white/10 disabled:opacity-60"
          >
            Réessayer
          </button>
        </div>
      ) : null}

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="rounded-2xl border border-white/10 bg-white/5 p-5"
            >
              <div className="h-5 w-2/3 rounded bg-white/10" />
              <div className="mt-3 h-4 w-1/2 rounded bg-white/10" />
              <div className="mt-2 h-4 w-1/3 rounded bg-white/10" />
              <div className="mt-5 h-9 w-32 rounded-xl bg-white/10" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-7">
          <h2 className="text-lg font-semibold">Aucun événement disponible</h2>
          <p className="mt-2 text-sm text-white/70">
            Reviens plus tard ou consulte la marketplace pour les reventes
            officielles.
          </p>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/marketplace"
              className="inline-flex items-center justify-center rounded-xl bg-[#7A3CFF] px-4 py-2 text-sm font-medium hover:opacity-90"
            >
              Aller à la marketplace
            </Link>
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setTimeFilter("all");
              }}
              className="inline-flex items-center justify-center rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium hover:bg-white/10"
            >
              Réinitialiser les filtres
            </button>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {filtered.map((e) => {
            const when = formatStartsIn(e.start_at, nowTs);
            return (
              <Link
                key={e.id}
                href={`/events/${e.id}`}
                className="group rounded-2xl border border-white/10 bg-white/5 p-5 transition hover:bg-white/10"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-lg font-semibold">
                        {e.title || "Événement"}
                      </h2>
                      {when ? (
                        <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-white/70">
                          {when}
                        </span>
                      ) : null}
                    </div>

                    <p className="mt-2 text-sm text-white/80">
                      {formatDate(e.start_at)}
                    </p>

                    <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-white/60">
                      <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-xs">
                        {e.city}
                      </span>
                      {e.venue_name ? (
                        <span className="truncate text-xs text-white/60">
                          {e.venue_name}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="mt-5 flex items-center justify-between">
                  <div className="text-xs text-white/50">
                    Billetterie officielle · Anti-fraude
                  </div>
                  <div className="inline-flex items-center justify-center rounded-xl bg-[#7A3CFF] px-4 py-2 text-sm font-medium text-white hover:opacity-90">
                    Voir →
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}