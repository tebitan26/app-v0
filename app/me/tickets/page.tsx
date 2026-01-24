"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { supabase } from "../../lib/supabaseClient";

type EventInfo = {
  title: string;
  city: string;
  venue_name: string | null;
  start_at: string;
  end_at: string | null;
  ticket_unlock_hours: number | null;
};

type BatchInfo = {
  name: string;
  price_cents: number;
  currency: string;
};

type TicketRow = {
  id: string;
  status: string;
  created_at: string;
  used_at: string | null;
  event_id: string;
  batch_id: string | null;
  events: EventInfo | null;
  ticket_batches: BatchInfo | null;
};

function formatUnlockLabel(unlockHours: number) {
  const hours = Number.isFinite(unlockHours) ? unlockHours : 2;
  return `T-${hours}h`;
}

function formatTicketStatus(status: string) {
  const s = (status || "").toUpperCase();
  if (s === "VALID" || s === "ACTIVE") return "ACTIF";
  if (s === "USED") return "UTILISÉ";
  if (s === "CANCELLED" || s === "CANCELED") return "ANNULÉ";
  if (s === "PENDING") return "EN ATTENTE";
  if (s === "EN_REVENTE") return "EN REVENTE";
  return s || "INCONNU";
}

function isUsedTicket(t: TicketRow) {
  const s = (t.status || "").toUpperCase();
  return Boolean(t.used_at) || s === "USED";
}

function isResaleTicket(t: TicketRow, resaleByTicketId: Record<string, string>) {
  const s = (t.status || "").toUpperCase();
  return s === "EN_REVENTE" || Boolean(resaleByTicketId[t.id]);
}

function isCancelledTicket(t: TicketRow) {
  const s = (t.status || "").toUpperCase();
  return s === "CANCELLED" || s === "CANCELED";
}

function computeEventTimes(event: EventInfo | null) {
  const startAt = event?.start_at ? new Date(event.start_at) : null;
  const endAt = event?.end_at
    ? new Date(event.end_at)
    : startAt
    ? new Date(startAt.getTime() + 2 * 60 * 60 * 1000)
    : null;
  return { startAt, endAt };
}

function formatSecondsLeft(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m < 60) return `${m}m ${String(r).padStart(2, "0")}s`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h}h ${String(mm).padStart(2, "0")}m`;
}

// Countdown: Mois/Jours si >= 24h, sinon Heures/Minutes
function formatCountdownToStart(
  startAtIso: string | null | undefined,
  nowTs: number
) {
  if (!startAtIso) return null;
  const start = new Date(startAtIso);
  if (Number.isNaN(start.getTime())) return null;

  const diffMs = start.getTime() - nowTs;
  if (diffMs <= 0) return null;

  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);

  if (diffHr < 24) {
    const h = diffHr;
    const m = diffMin % 60;
    return `${h}h ${String(m).padStart(2, "0")}m`;
  }

  // mois/jours (approx calendaire)
  let months = 0;
  const cursor = new Date(nowTs);
  while (true) {
    const next = new Date(cursor.getTime());
    next.setMonth(next.getMonth() + 1);
    if (next.getTime() <= start.getTime()) {
      months += 1;
      cursor.setMonth(cursor.getMonth() + 1);
    } else {
      break;
    }
    if (months > 60) break;
  }
  const remainingMs = start.getTime() - cursor.getTime();
  const days = Math.floor(remainingMs / (24 * 60 * 60 * 1000));

  if (months > 0) return `${months} mois ${days} j`;
  return `${days} j`;
}

function formatEventTimingChip(event: EventInfo | null, nowTs: number) {
  const { startAt, endAt } = computeEventTimes(event);
  if (!startAt) return null;

  if (endAt && nowTs > endAt.getTime()) return "Terminé";
  if (nowTs >= startAt.getTime()) return "En cours";

  const countdown = formatCountdownToStart(event?.start_at ?? null, nowTs);
  return countdown ? `Débute dans ${countdown}` : null;
}

type TicketGroup = {
  event_id: string;
  event: EventInfo | null;
  tickets: TicketRow[];
};

function groupTicketsByEvent(list: TicketRow[]): TicketGroup[] {
  const map = new Map<string, TicketGroup>();
  for (const t of list) {
    const key = t.event_id || "unknown";
    const existing = map.get(key);
    if (existing) {
      existing.tickets.push(t);
      if (!existing.event && t.events) existing.event = t.events;
    } else {
      map.set(key, { event_id: key, event: t.events ?? null, tickets: [t] });
    }
  }

  const arr = Array.from(map.values());
  arr.sort((a, b) => {
    const da = a.event?.start_at ? new Date(a.event.start_at).getTime() : 0;
    const db = b.event?.start_at ? new Date(b.event.start_at).getTime() : 0;
    return da - db;
  });
  return arr;
}

export default function MyTicketsPage() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [userId, setUserId] = useState<string | null>(null);

  const [qrTokens, setQrTokens] = useState<Record<string, string | null>>({});
  const [qrExp, setQrExp] = useState<Record<string, number | null>>({});
  const [qrError, setQrError] = useState<Record<string, string | null>>({});
  const [qrLoading, setQrLoading] = useState<Record<string, boolean>>({});
  const [resaleLoading, setResaleLoading] = useState<Record<string, boolean>>(
    {}
  );
  const [resaleError, setResaleError] = useState<Record<string, string | null>>(
    {}
  );
  const [resaleByTicketId, setResaleByTicketId] = useState<
    Record<string, string>
  >({});
  const [showStaffCode, setShowStaffCode] = useState<Record<string, boolean>>(
    {}
  );
  const [copyStatus, setCopyStatus] = useState<Record<string, boolean>>({});

  const [activeTab, setActiveTab] = useState<"active" | "resale" | "used">(
    "active"
  );

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const toggleGroup = (key: string) => {
    setOpenGroups((prev) => ({ ...prev, [key]: !(prev[key] ?? true) }));
  };

  const [nowTs, setNowTs] = useState(() => Date.now());
  const refreshIntervals = useRef<Record<string, number>>({});
  const codeInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const loadTickets = useCallback(async () => {
    setLoading(true);
    setErr(null);

    try {
      const { data: userData, error: userErr } = await supabase.auth.getUser();

      if (userErr) {
        setErr(userErr.message || "Impossible de charger les billets.");
        setTickets([]);
        setResaleByTicketId({});
        return;
      }

      const user = userData?.user;
      if (!user) {
        setUserId(null);
        setTickets([]);
        setResaleByTicketId({});
        return;
      }

      setUserId(user.id);

      const { data: tk, error: tkErr } = await supabase
        .from("tickets")
        .select(
          "id,status,created_at,used_at,event_id,batch_id,events(title,city,venue_name,start_at,end_at,ticket_unlock_hours),ticket_batches(name,price_cents,currency)"
        )
        .eq("owner_id", user.id)
        .order("created_at", { ascending: false });

      if (tkErr) {
        setErr(tkErr.message || "Impossible de charger les billets.");
        setTickets([]);
        setResaleByTicketId({});
        return;
      }

      const normalized: TicketRow[] = (tk ?? []).map((row: any) => {
        const ev = Array.isArray(row.events)
          ? row.events[0] ?? null
          : row.events ?? null;
        const bt = Array.isArray(row.ticket_batches)
          ? row.ticket_batches[0] ?? null
          : row.ticket_batches ?? null;

        return {
          id: row.id,
          status: row.status,
          created_at: row.created_at,
          used_at: row.used_at ?? null,
          event_id: row.event_id,
          batch_id: row.batch_id ?? null,
          events: ev,
          ticket_batches: bt,
        };
      });

      setTickets(normalized);

      const ticketIds = normalized.map((ticket) => ticket.id);
      if (ticketIds.length === 0) {
        setResaleByTicketId({});
        return;
      }

      const { data: resaleRows, error: resaleErr } = await supabase
        .from("ticket_resales")
        .select("id,ticket_id")
        .eq("seller_id", user.id)
        .eq("state", "OPEN")
        .in("ticket_id", ticketIds);

      if (resaleErr) {
        setErr(resaleErr.message || "Impossible de charger les billets.");
        setResaleByTicketId({});
        return;
      }

      const map: Record<string, string> = {};
      (resaleRows ?? []).forEach((row: any) => {
        if (row?.ticket_id && row?.id) map[row.ticket_id] = row.id;
      });
      setResaleByTicketId(map);
    } catch {
      setErr("Impossible de charger les billets.");
      setTickets([]);
      setResaleByTicketId({});
    } finally {
      setLoading(false);
    }
  }, []);

  // Load tickets
  useEffect(() => {
    let mounted = true;
    if (!mounted) return;
    loadTickets();
    return () => {
      mounted = false;
    };
  }, [loadTickets]);

  // Tick for countdown
  useEffect(() => {
    const timer = window.setInterval(() => setNowTs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const fetchQrToken = useCallback(async (ticketId: string) => {
    setQrLoading((prev) => ({ ...prev, [ticketId]: true }));
    setQrError((prev) => ({ ...prev, [ticketId]: null }));

    try {
      // 1) Get session (sometimes null right after login)
      let { data: sessionData, error: sessionErr } =
        await supabase.auth.getSession();
      let accessToken = sessionData?.session?.access_token ?? null;

      // 2) If missing, try refreshSession once
      if (!accessToken) {
        const refresh = await supabase.auth.refreshSession();
        sessionData = refresh.data;
        sessionErr = refresh.error;
        accessToken = sessionData?.session?.access_token ?? null;
      }

      if (sessionErr || !accessToken) {
        setQrError((prev) => ({ ...prev, [ticketId]: "Not_authenticated" }));
        return;
      }

      const res = await fetch(
        `/api/tickets/token?ticketId=${encodeURIComponent(ticketId)}`,
        {
          method: "GET",
          headers: { Authorization: `Bearer ${accessToken}` },
          credentials: "same-origin",
          cache: "no-store",
        }
      );

      let json: any = null;
      try {
        json = await res.json();
      } catch {
        // ignore parse error
      }

      if (!res.ok) {
        const errorCode = json?.error;
        setQrError((prev) => ({
          ...prev,
          [ticketId]:
            errorCode === "event_expired"
              ? "Événement passé."
              : errorCode ?? `Erreur QR (${res.status})`,
        }));
        return;
      }

      if (!json?.token || !json?.exp) {
        setQrError((prev) => ({ ...prev, [ticketId]: "Réponse QR invalide." }));
        return;
      }

      setQrTokens((prev) => ({ ...prev, [ticketId]: json.token }));
      setQrExp((prev) => ({ ...prev, [ticketId]: json.exp }));
    } catch (e: any) {
      setQrError((prev) => ({
        ...prev,
        [ticketId]: e?.message ?? "Erreur QR inconnue.",
      }));
    } finally {
      setQrLoading((prev) => ({ ...prev, [ticketId]: false }));
    }
  }, []);

  function handleShowCode(ticketId: string) {
    setShowStaffCode((prev) => ({ ...prev, [ticketId]: true }));
    window.setTimeout(() => {
      const input = codeInputRefs.current[ticketId];
      if (input) {
        input.focus();
        input.select();
      }
    }, 0);
  }

  async function handleCopyCode(ticketId: string, code: string) {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopyStatus((prev) => ({ ...prev, [ticketId]: true }));
      window.setTimeout(() => {
        setCopyStatus((prev) => ({ ...prev, [ticketId]: false }));
      }, 1500);
    } catch {
      setCopyStatus((prev) => ({ ...prev, [ticketId]: false }));
    }
  }

  async function handleResaleCreate(ticketId: string) {
    setResaleLoading((prev) => ({ ...prev, [ticketId]: true }));
    setResaleError((prev) => ({ ...prev, [ticketId]: null }));

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token ?? null;

      if (!accessToken) {
        setResaleError((prev) => ({ ...prev, [ticketId]: "Non authentifié." }));
        return;
      }

      const res = await fetch("/api/resale/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ ticket_id: ticketId }),
      });

      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setResaleError((prev) => ({
          ...prev,
          [ticketId]: payload?.error || "Erreur revente.",
        }));
        return;
      }

      setTickets((prev) =>
        prev.map((ticket) =>
          ticket.id === ticketId ? { ...ticket, status: "EN_REVENTE" } : ticket
        )
      );
    } catch {
      setResaleError((prev) => ({ ...prev, [ticketId]: "Erreur réseau." }));
    } finally {
      setResaleLoading((prev) => ({ ...prev, [ticketId]: false }));
    }
  }

  async function handleResaleCancel(ticketId: string, resaleId: string) {
    const confirmed = window.confirm("Confirmer le retrait ?");
    if (!confirmed) return;

    setResaleLoading((prev) => ({ ...prev, [ticketId]: true }));
    setResaleError((prev) => ({ ...prev, [ticketId]: null }));

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token ?? null;

      if (!accessToken) {
        setResaleError((prev) => ({ ...prev, [ticketId]: "Non authentifié." }));
        return;
      }

      const res = await fetch("/api/resale/cancel", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ resale_id: resaleId }),
      });

      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setResaleError((prev) => ({
          ...prev,
          [ticketId]: payload?.error || "Erreur retrait.",
        }));
        return;
      }

      await loadTickets();
    } catch {
      setResaleError((prev) => ({ ...prev, [ticketId]: "Erreur réseau." }));
    } finally {
      setResaleLoading((prev) => ({ ...prev, [ticketId]: false }));
    }
  }

  // Auto refresh QR every ~75s when token exists
  useEffect(() => {
    Object.entries(qrTokens).forEach(([ticketId, token]) => {
      const hasToken = Boolean(token);
      const existing = refreshIntervals.current[ticketId];

      if (hasToken && !existing) {
        refreshIntervals.current[ticketId] = window.setInterval(() => {
          fetchQrToken(ticketId);
        }, 75000);
      }

      if (!hasToken && existing) {
        window.clearInterval(existing);
        delete refreshIntervals.current[ticketId];
      }
    });

    return () => {
      Object.values(refreshIntervals.current).forEach((id) =>
        window.clearInterval(id)
      );
      refreshIntervals.current = {};
    };
  }, [fetchQrToken, qrTokens]);

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Mes billets</h1>
        <p className="mt-2 text-white/70">
          Retrouve tous tes accès Sidetick au même endroit.
        </p>

        <div className="mt-4 flex flex-wrap gap-2 text-xs text-white/70">
          <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1">
            Billet authentique
          </span>
          <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1">
            QR visible à T-2h
          </span>
          <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1">
            Revente officielle possible
          </span>
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href="/events"
            className="inline-flex items-center justify-center rounded-xl bg-[#7A3CFF] px-4 py-2 text-sm font-medium hover:opacity-90"
          >
            Voir les évènements
          </Link>
          <Link
            href="/marketplace"
            className="inline-flex items-center justify-center rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium hover:bg-white/10"
          >
            Marketplace
          </Link>
        </div>

        {/* Tabs */}
        <div className="mt-6 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("active")}
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
              activeTab === "active"
                ? "border-white/20 bg-white/10 text-white"
                : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
            }`}
          >
            Actifs
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("resale")}
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
              activeTab === "resale"
                ? "border-white/20 bg-white/10 text-white"
                : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
            }`}
          >
            En revente
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("used")}
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
              activeTab === "used"
                ? "border-white/20 bg-white/10 text-white"
                : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
            }`}
          >
            Utilisés / terminés
          </button>
        </div>
      </div>

      {err ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-200">
          <div>{err}</div>
          <button
            type="button"
            onClick={loadTickets}
            className="mt-3 inline-flex items-center justify-center rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-white hover:bg-white/10"
          >
            Réessayer
          </button>
        </div>
      ) : null}

      {loading ? (
        <p className="text-white/60">Chargement…</p>
      ) : !userId ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <p className="text-white/80">Connecte-toi pour voir tes billets.</p>
          <Link
            href="/login"
            className="mt-4 inline-flex rounded-xl bg-[#7A3CFF] px-4 py-2 text-sm font-medium hover:opacity-90"
          >
            Se connecter
          </Link>
        </div>
      ) : tickets.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-7">
          <h2 className="text-lg font-semibold">Aucun billet pour le moment</h2>
          <p className="mt-2 text-sm text-white/70">
            Achetez votre premier billet sur un évènement Sidetick — vous le
            retrouverez ici avec son QR anti-fraude.
          </p>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/events"
              className="inline-flex items-center justify-center rounded-xl bg-[#7A3CFF] px-4 py-2 text-sm font-medium hover:opacity-90"
            >
              Voir les évènements
            </Link>
            <Link
              href="/marketplace"
              className="inline-flex items-center justify-center rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium hover:bg-white/10"
            >
              Voir la marketplace
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-10">
          {(() => {
            const activeList = tickets.filter((ticket) => {
              const { endAt } = computeEventTimes(ticket.events);
              const isExpired = endAt ? nowTs > endAt.getTime() : false;
              if (isExpired) return false;
              if (isCancelledTicket(ticket)) return false;
              if (isUsedTicket(ticket)) return false;
              if (isResaleTicket(ticket, resaleByTicketId)) return false;
              return true;
            });

            const resaleList = tickets.filter((ticket) => {
              const { endAt } = computeEventTimes(ticket.events);
              const isExpired = endAt ? nowTs > endAt.getTime() : false;
              if (isExpired) return false;
              if (isCancelledTicket(ticket)) return false;
              if (isUsedTicket(ticket)) return false;
              return isResaleTicket(ticket, resaleByTicketId);
            });

            // “Utilisés” = USED / used_at / expirés / cancelled
            const usedList = tickets.filter((ticket) => {
              const { endAt } = computeEventTimes(ticket.events);
              const isExpired = endAt ? nowTs > endAt.getTime() : false;
              return (
                isUsedTicket(ticket) || isExpired || isCancelledTicket(ticket)
              );
            });

            const renderTicketCard = (
              ticket: TicketRow,
              mode: "active" | "resale" | "used"
            ) => {
              const event = ticket.events;
              const batch = ticket.ticket_batches;

              const unlockHours = event?.ticket_unlock_hours ?? 2;
              const unlockLabel = formatUnlockLabel(unlockHours);

              const { startAt, endAt } = computeEventTimes(event);
              const unlockAt = startAt
                ? new Date(startAt.getTime() - unlockHours * 60 * 60 * 1000)
                : null;

              const unlocked = unlockAt ? nowTs >= unlockAt.getTime() : false;

              const qrToken = qrTokens[ticket.id];
              const qrExpiresAt = qrExp[ticket.id];
              const qrErrorMessage = qrError[ticket.id];
              const qrBusy = qrLoading[ticket.id];

              const secondsLeft =
                typeof qrExpiresAt === "number"
                  ? Math.max(0, Math.floor((qrExpiresAt - nowTs) / 1000))
                  : null;

              const staffUrl = qrToken ? `/staff?token=${qrToken}` : null;
              const showCode = showStaffCode[ticket.id] ?? false;
              const copied = copyStatus[ticket.id] ?? false;

              const resaleBusy = resaleLoading[ticket.id] ?? false;
              const resaleErrorMessage = resaleError[ticket.id] ?? null;

              const resaleId = resaleByTicketId[ticket.id];
              const canCancelResale = Boolean(resaleId);

              const isExpired = endAt ? nowTs > endAt.getTime() : false;
              const isUsed = isUsedTicket(ticket);
              const isCancelled = isCancelledTicket(ticket);

              const isResellable =
                !isUsed &&
                !isExpired &&
                !isCancelled &&
                !resaleId &&
                (ticket.status === "VALID" || ticket.status === "ACTIVE");

              return (
                <div
                  key={ticket.id}
                  className="rounded-2xl border border-white/10 bg-white/5 p-5"
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-2">
                      <div className="text-xs text-white/50">Billet</div>
                      <h3 className="text-xl font-semibold">
                        {event?.title ?? "Événement"}
                      </h3>
                      <p className="text-sm text-white/70">
                        {event?.start_at
                          ? new Date(event.start_at).toLocaleString()
                          : "Date à confirmer"}
                      </p>
                      <p className="text-sm text-white/60">
                        {event?.city ?? "Ville à confirmer"}
                        {event?.venue_name ? ` · ${event.venue_name}` : ""}
                      </p>
                      <p className="text-sm text-white/70">
                        Lot:{" "}
                        <span className="text-white">
                          {batch?.name ?? "Standard"}
                        </span>
                      </p>
                    </div>

                    <div className="flex flex-col items-start gap-2 text-sm sm:items-end">
                      <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-white/70">
                        Statut:{" "}
                        <span className="text-white">
                          {formatTicketStatus(ticket.status)}
                        </span>
                      </span>

                      {mode === "used" ? (
                        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-white/70">
                          {isCancelled
                            ? "ANNULÉ"
                            : isUsed
                            ? "UTILISÉ"
                            : "TERMINÉ"}
                        </span>
                      ) : (
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${
                            unlocked
                              ? "bg-[#7A3CFF]/20 text-[#C7B5FF]"
                              : "bg-white/10 text-white/70"
                          }`}
                        >
                          {unlocked ? "QR disponible" : "QR verrouillé"}
                        </span>
                      )}

                      {!unlocked && unlockAt && mode !== "used" ? (
                        <span className="text-xs text-white/60">
                          Disponible dans{" "}
                          {(() => {
                            const diffMs = Math.max(
                              0,
                              unlockAt.getTime() - nowTs
                            );
                            const diffMin = Math.floor(diffMs / 60000);
                            const h = Math.floor(diffMin / 60);
                            const m = diffMin % 60;
                            if (h <= 0) return `${m}m`;
                            return `${h}h ${String(m).padStart(2, "0")}m`;
                          })()}
                        </span>
                      ) : null}

                      {isExpired ? (
                        <span className="rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1 text-xs font-semibold text-red-200">
                          Événement terminé
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-white/70">
                    {isExpired || mode === "used" ? (
                      <span>Billet terminé — revente et scan désactivés.</span>
                    ) : !unlocked ? (
                      <span>
                        QR anti-fraude visible à {unlockLabel}. Il apparaîtra
                        automatiquement ici avant l’évènement.
                      </span>
                    ) : qrToken && staffUrl ? (
                      <div className="space-y-3">
                        <div className="flex flex-col items-center gap-3 rounded-xl bg-white/5 p-3 text-center sm:flex-row sm:items-start sm:text-left">
                          <QRCodeCanvas
                            value={staffUrl}
                            size={120}
                            bgColor="#0D001C"
                            fgColor="#FFFFFF"
                          />
                          <div className="space-y-2">
                            <p className="text-sm text-white/80">
                              Scan requis pour entrée staff.
                            </p>
                            <button
                              type="button"
                              onClick={() => handleShowCode(ticket.id)}
                              className="inline-flex items-center justify-center rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium hover:bg-white/10"
                            >
                              Afficher le code pour le staff
                            </button>
                            {secondsLeft !== null ? (
                              <p className="text-xs text-white/60">
                                Expire dans {formatSecondsLeft(secondsLeft)}
                              </p>
                            ) : null}
                          </div>
                        </div>

                        {showCode ? (
                          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                            <p className="text-xs text-white/60">
                              Code de validation (à donner au staff)
                            </p>
                            <div className="mt-2 flex flex-wrap items-center gap-3">
                              <input
                                ref={(node) => {
                                  codeInputRefs.current[ticket.id] = node;
                                }}
                                value={qrToken}
                                readOnly
                                className="min-w-[220px] flex-1 rounded-xl border border-white/15 bg-black/40 px-3 py-2 font-mono text-xs text-white outline-none"
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  handleCopyCode(ticket.id, qrToken)
                                }
                                className="inline-flex items-center justify-center rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-xs font-medium hover:bg-white/10"
                              >
                                {copied ? "Copié" : "Copier"}
                              </button>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <span>
                        QR disponible. Clique sur « Afficher QR » pour générer
                        un code temporaire.
                      </span>
                    )}
                  </div>

                  {unlocked && !isExpired && mode !== "used" ? (
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={() => fetchQrToken(ticket.id)}
                        disabled={qrBusy}
                        className="inline-flex items-center justify-center rounded-xl bg-[#7A3CFF] px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-60"
                      >
                        {qrToken ? "Rafraîchir QR" : "Afficher QR"}
                      </button>
                      {qrErrorMessage ? (
                        <span className="text-sm text-red-200">
                          {qrErrorMessage}
                        </span>
                      ) : null}
                    </div>
                  ) : null}

                  {isResellable ? (
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={() => handleResaleCreate(ticket.id)}
                        disabled={resaleBusy}
                        className="inline-flex items-center justify-center rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium hover:bg-white/10 disabled:opacity-60"
                      >
                        {resaleBusy ? "Mise en revente…" : "Mettre en revente"}
                      </button>
                      {resaleErrorMessage ? (
                        <span className="text-sm text-red-200">
                          {resaleErrorMessage}
                        </span>
                      ) : null}
                      <p className="w-full text-xs text-white/60">
                        Revente officielle : prix plafonné + frais 10%.
                      </p>
                    </div>
                  ) : null}

                  {canCancelResale && mode !== "used" ? (
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={() => handleResaleCancel(ticket.id, resaleId)}
                        disabled={resaleBusy}
                        className="inline-flex items-center justify-center rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium hover:bg-white/10 disabled:opacity-60"
                      >
                        {resaleBusy
                          ? "Retrait…"
                          : isExpired
                          ? "Retirer (forcé)"
                          : "Retirer de la revente"}
                      </button>
                      {resaleErrorMessage ? (
                        <span className="text-sm text-red-200">
                          {resaleErrorMessage}
                        </span>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-xs text-white/50">
                      Ticket ID: {ticket.id}
                    </div>
                    <Link
                      href={`/events/${ticket.event_id}`}
                      className="inline-flex items-center justify-center rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium hover:bg-white/10"
                    >
                      Voir l&apos;événement
                    </Link>
                  </div>
                </div>
              );
            };

            const renderAccordion = (
              sectionKey: string,
              list: TicketRow[],
              mode: "active" | "resale" | "used"
            ) => {
              const groups = groupTicketsByEvent(list);

              if (groups.length === 0) {
                return (
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-white/70">
                    Aucun billet.
                  </div>
                );
              }

              return (
                <div className="space-y-4">
                  {groups.map((g) => {
                    const event = g.event;
                    const title = event?.title ?? "Événement";
                    const dateLabel = event?.start_at
                      ? new Date(event.start_at).toLocaleString()
                      : "Date à confirmer";
                    const timingChip = formatEventTimingChip(event, nowTs);

                    const key = `${sectionKey}:${g.event_id}`;
                    const open = openGroups[key] ?? mode !== "used";

                    return (
                      <div
                        key={key}
                        className="rounded-2xl border border-white/10 bg-white/5"
                      >
                        <button
                          type="button"
                          onClick={() => toggleGroup(key)}
                          className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
                        >
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-white">
                              {title}
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-white/60">
                              <span>{dateLabel}</span>
                              <span>
                                {g.tickets.length} billet
                                {g.tickets.length > 1 ? "s" : ""}
                              </span>
                              {timingChip ? (
                                <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5">
                                  {timingChip}
                                </span>
                              ) : null}
                            </div>
                          </div>
                          <div className="shrink-0 text-xs text-white/70">
                            {open ? "Masquer" : "Afficher"}
                          </div>
                        </button>

                        {open ? (
                          <div className="border-t border-white/10 px-5 py-4">
                            <div className="space-y-4">
                              {g.tickets.map((t) => renderTicketCard(t, mode))}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              );
            };

            // TAB CONTENT
            return (
              <div className="space-y-3">
                {activeTab === "active" ? (
                  <>
                    <h2 className="text-lg font-semibold">Billets actifs</h2>
                    <p className="text-sm text-white/70">
                      Billets disponibles (non utilisés et non listés en revente).
                    </p>
                    {renderAccordion("active", activeList, "active")}
                  </>
                ) : null}

                {activeTab === "resale" ? (
                  <>
                    <h2 className="text-lg font-semibold">Billets en revente</h2>
                    <p className="text-sm text-white/70">
                      Billets actuellement listés sur la marketplace.
                    </p>
                    {renderAccordion("resale", resaleList, "resale")}
                  </>
                ) : null}

                {activeTab === "used" ? (
                  <>
                    <h2 className="text-lg font-semibold">
                      Billets utilisés / terminés
                    </h2>
                    <p className="text-sm text-white/70">
                      Billets déjà scannés/consommés, expirés, ou annulés.
                    </p>
                    {renderAccordion("used", usedList, "used")}
                  </>
                ) : null}
              </div>
            );
          })()}
        </div>
      )}
    </section>
  );
}