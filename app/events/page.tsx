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

function formatDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Date à confirmer";
  return d.toLocaleString();
}

function formatStartsIn(iso: string) {
  const start = new Date(iso);
  if (Number.isNaN(start.getTime())) return null;

  const now = new Date();
  const diffMs = start.getTime() - now.getTime();
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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return events;
    return events.filter((e) => {
      const hay = `${e.title ?? ""} ${e.city ?? ""} ${e.venue_name ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [events, query]);

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Événements</h1>
          <p className="mt-2 text-white/70">
            Choisis un événement, puis achète ton billet en quelques secondes.
          </p>
        </div>

        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <div className="relative w-full sm:w-[320px]">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher (titre, ville, salle)"
              className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm text-white placeholder:text-white/40 outline-none focus:border-white/25"
            />
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
              onClick={() => setQuery("")}
              className="inline-flex items-center justify-center rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium hover:bg-white/10"
            >
              Réinitialiser la recherche
            </button>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {filtered.map((e) => {
            const when = formatStartsIn(e.start_at);
            return (
              <Link
                key={e.id}
                href={`/events/${e.id}`}
                className="group rounded-2xl border border-white/10 bg-white/5 p-5 transition hover:bg-white/10"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h2 className="truncate text-lg font-semibold">
                      {e.title || "Événement"}
                    </h2>
                    <p className="mt-2 text-sm text-white/70">
                      {formatDate(e.start_at)}
                    </p>
                    <p className="mt-1 text-sm text-white/60">
                      {e.city}
                      {e.venue_name ? ` · ${e.venue_name}` : ""}
                    </p>
                  </div>

                  {when ? (
                    <div className="shrink-0 rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-white/70">
                      {when}
                    </div>
                  ) : null}
                </div>

                <div className="mt-5 flex items-center justify-between">
                  <div className="text-xs text-white/50">
                    Billetterie officielle · Anti-fraude
                  </div>
                  <div className="inline-flex items-center justify-center rounded-xl bg-[#7A3CFF] px-4 py-2 text-sm font-medium text-white hover:opacity-90">
                    Voir détails →
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