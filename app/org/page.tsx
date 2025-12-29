"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useSessionProfile } from "../lib/useSessionProfile";

type EventRow = {
  id: string;
  title: string;
  city: string;
  venue_name: string | null;
  start_at: string;
  status: "DRAFT" | "PUBLISHED" | "CANCELLED";
};

export default function OrgPage() {
  const { loading, role } = useSessionProfile();
  const [events, setEvents] = useState<EventRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loadingEvents, setLoadingEvents] = useState(false);

  const allowed = role === "ORGANIZER" || role === "ADMIN";

  useEffect(() => {
    if (!allowed) return;

    async function load() {
      setLoadingEvents(true);
      setErr(null);

      const { data, error } = await supabase
        .from("events")
        .select("id,title,city,venue_name,start_at,status")
        .order("start_at", { ascending: true });

      if (error) setErr(error.message);
      setEvents((data ?? []) as EventRow[]);
      setLoadingEvents(false);
    }

    load();
  }, [allowed]);

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
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Dashboard organisateur</h1>
          <p className="mt-2 text-white/70">
            Crée un événement, ajoute des lots de billets, puis publie.
          </p>
        </div>

        <Link
          href="/org/events/new"
          className="inline-flex rounded-xl bg-[#7A3CFF] px-5 py-3 font-medium hover:opacity-90"
        >
          + Créer un événement
        </Link>
      </div>

      {err ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-200">
          {err}
        </div>
      ) : null}

      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
        <h2 className="text-lg font-semibold">Mes événements</h2>

        {loadingEvents ? (
          <p className="mt-3 text-white/60">Chargement…</p>
        ) : events.length === 0 ? (
          <p className="mt-3 text-white/60">
            Aucun événement. Clique sur “Créer un événement”.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-white/10">
            {events.map((e) => (
              <li key={e.id} className="py-4 flex items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{e.title}</p>
                    <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-xs text-white/70">
                      {e.status}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-white/60">
                    {new Date(e.start_at).toLocaleString()} · {e.city}
                    {e.venue_name ? ` · ${e.venue_name}` : ""}
                  </p>
                </div>

                <Link
                  href={`/org/events/${e.id}`}
                  className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm hover:bg-white/10"
                >
                  Gérer
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}