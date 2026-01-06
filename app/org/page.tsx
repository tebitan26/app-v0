"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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

type OrderRow = {
  event_id: string;
  amount_cents: number | null;
  fee_cents: number | null;
};

type OrdersStats = {
  soldCount: number;
  grossCents: number;
  feeCents: number;
};

export default function OrgPage() {
  const { loading, role } = useSessionProfile();
  const [events, setEvents] = useState<EventRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [ordersByEventId, setOrdersByEventId] = useState<
    Record<string, OrdersStats>
  >({});

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

  useEffect(() => {
    if (!allowed) return;

    async function load() {
      setLoadingEvents(true);
      setErr(null);

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        setErr("Non authentifié");
        setEvents([]);
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

      if (error) setErr(error.message);
      const eventsData = (data ?? []) as EventRow[];
      setEvents(eventsData);

      const nowTs = Date.now();
      const pastEventIds = eventsData
        .filter((event) => new Date(event.start_at).getTime() < nowTs)
        .map((event) => event.id);

      if (pastEventIds.length === 0) {
        setOrdersByEventId({});
        setLoadingEvents(false);
        return;
      }

      const { data: ordersData, error: ordersError } = await supabase
        .from("orders")
        .select("event_id,amount_cents,fee_cents")
        .eq("status", "PAID")
        .in("event_id", pastEventIds);

      if (ordersError) {
        setErr(ordersError.message);
        setOrdersByEventId({});
        setLoadingEvents(false);
        return;
      }

      const stats = (ordersData ?? []).reduce((acc, order) => {
        const row = order as OrderRow;
        const current = acc[row.event_id] ?? {
          soldCount: 0,
          grossCents: 0,
          feeCents: 0,
        };
        current.soldCount += 1;
        current.grossCents += row.amount_cents ?? 0;
        current.feeCents += row.fee_cents ?? 0;
        acc[row.event_id] = current;
        return acc;
      }, {} as Record<string, OrdersStats>);
      setOrdersByEventId(stats);
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
        <h2 className="text-lg font-semibold">Événements à venir</h2>

        {loadingEvents ? (
          <p className="mt-3 text-white/60">Chargement…</p>
        ) : upcomingEvents.length === 0 ? (
          <p className="mt-3 text-white/60">Aucun événement à venir</p>
        ) : (
          <ul className="mt-4 divide-y divide-white/10">
            {upcomingEvents.map((e) => (
              <li
                key={e.id}
                className="py-4 flex items-center justify-between gap-4"
              >
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
                    <p className="mt-1 text-sm text-white/60">
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
                            acc +
                            (b.quantity_sold ?? 0) * (b.price_cents ?? 0),
                          0
                        );
                        const currency = batches[0]?.currency ?? "EUR";
                        const gross = (grossCents / 100).toFixed(2);
                        return cap > 0
                          ? `Vendus: ${sold} / ${cap} · CA: ${gross} ${currency}`
                          : `Vendus: ${sold} · CA: ${gross} ${currency}`;
                      })()}
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

      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
        <h2 className="text-lg font-semibold">Événements passés</h2>

        {loadingEvents ? (
          <p className="mt-3 text-white/60">Chargement…</p>
        ) : pastEvents.length === 0 ? (
          <p className="mt-3 text-white/60">Aucun événement passé</p>
        ) : (
          <ul className="mt-4 divide-y divide-white/10">
            {pastEvents.map((e) => (
              <li
                key={e.id}
                className="py-4 flex items-center justify-between gap-4"
              >
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
                    <p className="mt-1 text-sm text-white/60">
                      {(() => {
                        const stats = ordersByEventId[e.id] ?? {
                          soldCount: 0,
                          grossCents: 0,
                          feeCents: 0,
                        };
                        const gross = (stats.grossCents / 100).toFixed(2);
                        const fees = (stats.feeCents / 100).toFixed(2);
                        return `Vendus : ${stats.soldCount} · CA : ${gross} EUR · Frais : ${fees} EUR`;
                      })()}
                    </p>
                    <p className="mt-1 text-sm text-white/60">
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
                            acc +
                            (b.quantity_sold ?? 0) * (b.price_cents ?? 0),
                          0
                        );
                        const currency = batches[0]?.currency ?? "EUR";
                        const gross = (grossCents / 100).toFixed(2);
                        return cap > 0
                          ? `Vendus: ${sold} / ${cap} · CA: ${gross} ${currency}`
                          : `Vendus: ${sold} · CA: ${gross} ${currency}`;
                      })()}
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
