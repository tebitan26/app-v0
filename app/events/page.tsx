"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

type EventRow = {
  id: string;
  title: string;
  city: string;
  venue_name: string | null;
  start_at: string;
};

export default function EventsPage() {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setErr(null);

      const { data, error } = await supabase
        .from("events")
        .select("id,title,city,venue_name,start_at")
        .eq("status", "PUBLISHED")
        .order("start_at", { ascending: true });

      if (error) setErr(error.message);
      setEvents((data ?? []) as EventRow[]);
      setLoading(false);
    }

    load();
  }, []);

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Événements</h1>
        <p className="mt-2 text-white/70">Découvre les événements disponibles.</p>
      </div>

      {err ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-200">
          {err}
        </div>
      ) : null}

      {loading ? (
        <p className="text-white/60">Chargement…</p>
      ) : events.length === 0 ? (
        <p className="text-white/60">Aucun événement publié pour le moment.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {events.map((e) => (
            <Link
              key={e.id}
              href={`/events/${e.id}`}
              className="rounded-2xl border border-white/10 bg-white/5 p-5 hover:bg-white/10 transition"
            >
              <h2 className="text-lg font-semibold">{e.title}</h2>
              <p className="mt-2 text-sm text-white/70">
                {new Date(e.start_at).toLocaleString()}
              </p>
              <p className="mt-1 text-sm text-white/60">
                {e.city}{e.venue_name ? ` · ${e.venue_name}` : ""}
              </p>
              <div className="mt-4 inline-flex rounded-xl border border-white/15 bg-white/5 px-3 py-1 text-xs text-white/70">
                Voir détails →
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}