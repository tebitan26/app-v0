"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useSessionProfile } from "../lib/useSessionProfile";

type TicketEvent = {
  title: string | null;
  start_at: string | null;
  end_at: string | null;
};

type TicketRow = {
  id: string;
  status: string | null;
  event: TicketEvent | null;
};

const PAST_STATUSES = new Set(["USED", "REVENDU", "ANNULÉ"]);

function formatEventDate(startAt: string | null) {
  if (!startAt) return "Date inconnue";
  const date = new Date(startAt);
  if (Number.isNaN(date.getTime())) return "Date inconnue";
  return date.toLocaleString("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatTicketStatus(status: string | null) {
  return status ? status.toUpperCase() : "INCONNU";
}

function isPastTicket(ticket: TicketRow, nowTs: number) {
  const status = (ticket.status ?? "").toUpperCase();
  if (PAST_STATUSES.has(status)) return true;

  const startAt = ticket.event?.start_at ?? null;
  const endAt = ticket.event?.end_at ?? null;
  const startTs = startAt ? Date.parse(startAt) : NaN;
  const endTs = endAt ? Date.parse(endAt) : NaN;

  if (!Number.isNaN(endTs) && endTs < nowTs) return true;
  if (Number.isNaN(endTs) && !Number.isNaN(startTs) && startTs < nowTs)
    return true;

  return false;
}

export default function MePage() {
  const { loading, userId, userEmail, role } = useSessionProfile();
  const [copied, setCopied] = useState(false);
  const copyTimeoutRef = useRef<number | null>(null);
  const [ticketsLoading, setTicketsLoading] = useState(false);
  const [ticketsError, setTicketsError] = useState<string | null>(null);
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const bugReportUrl =
    process.env.NEXT_PUBLIC_DISCORD_BUG_REPORT_URL ?? "https://discord.com";

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        window.clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadTickets() {
      if (!userId) {
        setTickets([]);
        setTicketsError(null);
        setTicketsLoading(false);
        return;
      }

      setTicketsLoading(true);
      setTicketsError(null);

      const { data, error } = await supabase
        .from("tickets")
        .select("id,status,events(title,start_at,end_at)")
        .eq("owner_id", userId)
        .order("created_at", { ascending: false });

      if (!isMounted) return;

      if (error) {
        setTicketsError("Impossible de charger les billets.");
        setTickets([]);
        setTicketsLoading(false);
        return;
      }

      const rows = (data ?? []) as Array<{
        id: string;
        status: string | null;
        events: TicketEvent | TicketEvent[] | null;
      }>;

      const normalized = rows.map((row) => {
        const event = Array.isArray(row.events)
          ? row.events[0] ?? null
          : row.events ?? null;

        return {
          id: row.id,
          status: row.status ?? null,
          event: event
            ? {
                title: event.title ?? null,
                start_at: event.start_at ?? null,
                end_at: event.end_at ?? null,
              }
            : null,
        };
      });

      setTickets(normalized);
      setTicketsLoading(false);
    }

    loadTickets();

    return () => {
      isMounted = false;
    };
  }, [userId]);

  const { activeTickets, pastTickets } = useMemo(() => {
    const nowTs = Date.now();
    const active: TicketRow[] = [];
    const past: TicketRow[] = [];

    tickets.forEach((ticket) => {
      if (isPastTicket(ticket, nowTs)) {
        past.push(ticket);
      } else {
        active.push(ticket);
      }
    });

    return { activeTickets: active, pastTickets: past };
  }, [tickets]);

  const handleCopyId = async () => {
    if (!userId) return;
    await navigator.clipboard.writeText(userId);
    setCopied(true);

    if (copyTimeoutRef.current) {
      window.clearTimeout(copyTimeoutRef.current);
    }

    copyTimeoutRef.current = window.setTimeout(() => {
      setCopied(false);
      copyTimeoutRef.current = null;
    }, 1000);
  };

  if (loading) {
    return <p className="text-white/70">Chargement…</p>;
  }

  if (!userEmail) {
    return (
      <section className="space-y-4">
        <h1 className="text-3xl font-bold">Mon profil</h1>
        <p className="text-white/70">Non authentifié</p>
        <Link
          href="/login"
          className="inline-flex rounded-xl bg-[#7A3CFF] px-5 py-3 font-medium hover:opacity-90"
        >
          Se connecter
        </Link>
        <a
          href={bugReportUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex rounded-xl border border-white/15 bg-white/5 px-5 py-3 font-medium hover:bg-white/10"
        >
          Signaler un problème
        </a>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
        <h1 className="text-3xl font-bold">Mon profil</h1>
        <div className="mt-4 space-y-2 text-white/70">
          <p>
            <span className="text-white/50">Email</span> · {userEmail}
          </p>
          <p>
            <span className="text-white/50">Rôle</span> · {role ?? "—"}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <p>
              <span className="text-white/50">User ID</span> · {userId ?? "—"}
            </p>
            {userId ? (
              <button
                type="button"
                onClick={handleCopyId}
                className="rounded-lg border border-white/15 px-3 py-1 text-xs text-white/70 hover:bg-white/10"
              >
                {copied ? "Copié ✅" : "Copier ID"}
              </button>
            ) : null}
          </div>
        </div>
        <p className="mt-4 text-xs text-white/40">
          (Bêta) La modification du profil arrive bientôt.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <Link
          href="/me/tickets"
          className="inline-flex rounded-xl border border-white/15 bg-white/5 px-5 py-3 font-medium hover:bg-white/10"
        >
          Mes billets
        </Link>
        <a
          href={bugReportUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex rounded-xl border border-white/15 bg-white/5 px-5 py-3 font-medium hover:bg-white/10"
        >
          Signaler un problème
        </a>
      </div>

      <div className="space-y-6">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <h2 className="text-xl font-semibold">Billets actifs</h2>
          {ticketsLoading ? (
            <p className="mt-3 text-white/60">Chargement…</p>
          ) : ticketsError ? (
            <p className="mt-3 text-white/60">{ticketsError}</p>
          ) : activeTickets.length === 0 ? (
            <p className="mt-3 text-white/60">Aucun billet actif.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {activeTickets.map((ticket) => (
                <div
                  key={ticket.id}
                  className="rounded-xl border border-white/10 bg-white/5 p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium">
                      {ticket.event?.title ?? "Événement sans titre"}
                    </p>
                    <span className="text-xs uppercase text-white/50">
                      {formatTicketStatus(ticket.status)}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-white/70">
                    {formatEventDate(ticket.event?.start_at ?? null)}
                  </p>
                  <p className="mt-2 text-xs text-white/40">
                    Ticket ID · {ticket.id}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <h2 className="text-xl font-semibold">Billets passés</h2>
          {ticketsLoading ? (
            <p className="mt-3 text-white/60">Chargement…</p>
          ) : ticketsError ? (
            <p className="mt-3 text-white/60">{ticketsError}</p>
          ) : pastTickets.length === 0 ? (
            <p className="mt-3 text-white/60">Aucun billet passé.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {pastTickets.map((ticket) => (
                <div
                  key={ticket.id}
                  className="rounded-xl border border-white/10 bg-white/5 p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium">
                      {ticket.event?.title ?? "Événement sans titre"}
                    </p>
                    <span className="text-xs uppercase text-white/50">
                      {formatTicketStatus(ticket.status)}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-white/70">
                    {formatEventDate(ticket.event?.start_at ?? null)}
                  </p>
                  <p className="mt-2 text-xs text-white/40">
                    Ticket ID · {ticket.id}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
