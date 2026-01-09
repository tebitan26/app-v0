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
  if (s === "VALID" || s === "ACTIVE") return "ACTIVE";
  if (s === "USED") return "USED";
  if (s === "CANCELLED" || s === "CANCELED") return "CANCELLED";
  if (s === "PENDING") return "PENDING";
  return s || "UNKNOWN";
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
  const [showStaffCode, setShowStaffCode] = useState<
    Record<string, boolean>
  >({});
  const [copyStatus, setCopyStatus] = useState<Record<string, boolean>>({});

  const [nowTs, setNowTs] = useState(() => Date.now());
  const refreshIntervals = useRef<Record<string, number>>({});
  const codeInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const loadTickets = useCallback(async () => {
    setLoading(true);
    setErr(null);

    const { data: userData, error: userErr } = await supabase.auth.getUser();

    if (userErr) {
      setErr(userErr.message);
      setLoading(false);
      return;
    }

    const user = userData?.user;
    if (!user) {
      setUserId(null);
      setTickets([]);
      setResaleByTicketId({});
      setLoading(false);
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
      setErr(tkErr.message);
      setTickets([]);
      setResaleByTicketId({});
      setLoading(false);
      return;
    }

    const normalized: TicketRow[] = (tk ?? []).map((row: any) => {
      const ev = Array.isArray(row.events) ? row.events[0] ?? null : row.events ?? null;
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
      setLoading(false);
      return;
    }

    const { data: resaleRows } = await supabase
      .from("ticket_resales")
      .select("id,ticket_id")
      .eq("seller_id", user.id)
      .eq("state", "OPEN")
      .in("ticket_id", ticketIds);

    const map: Record<string, string> = {};
    (resaleRows ?? []).forEach((row: any) => {
      if (row?.ticket_id && row?.id) map[row.ticket_id] = row.id;
    });
    setResaleByTicketId(map);
    setLoading(false);
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
      let { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
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

      const res = await fetch(`/api/tickets/token?ticketId=${encodeURIComponent(ticketId)}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${accessToken}` },
        credentials: "same-origin",
        cache: "no-store",
      });

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
      setQrError((prev) => ({ ...prev, [ticketId]: e?.message ?? "Erreur QR inconnue." }));
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
      const accessToken = sessionData.session?.access_token;

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
          ticket.id === ticketId
            ? { ...ticket, status: "EN_REVENTE" }
            : ticket
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
      const accessToken = sessionData.session?.access_token;

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
      Object.values(refreshIntervals.current).forEach((id) => window.clearInterval(id));
      refreshIntervals.current = {};
    };
  }, [fetchQrToken, qrTokens]);

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Mes billets</h1>
        <p className="mt-2 text-white/70">Retrouve tous tes accès Sidetick au même endroit.</p>
        <Link
          href="/resale"
          className="mt-4 inline-flex rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium hover:bg-white/10"
        >
          Voir la marketplace
        </Link>
      </div>

      {err ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-200">
          {err}
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
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-white/70">
          Aucun billet trouvé pour le moment.
        </div>
      ) : (
        <div className="space-y-6">
          {(() => {
            const activeTickets = tickets.filter((ticket) => {
              const startAt = ticket.events?.start_at
                ? new Date(ticket.events.start_at)
                : null;
              const endAt = ticket.events?.end_at
                ? new Date(ticket.events.end_at)
                : startAt
                ? new Date(startAt.getTime() + 2 * 60 * 60 * 1000)
                : null;
              return !endAt || nowTs <= endAt.getTime();
            });
            const pastTickets = tickets.filter((ticket) => {
              const startAt = ticket.events?.start_at
                ? new Date(ticket.events.start_at)
                : null;
              const endAt = ticket.events?.end_at
                ? new Date(ticket.events.end_at)
                : startAt
                ? new Date(startAt.getTime() + 2 * 60 * 60 * 1000)
                : null;
              return Boolean(endAt && nowTs > endAt.getTime());
            });

            const renderList = (list: TicketRow[]) => (
              <div className="grid gap-4">
                {list.map((ticket) => {
            const event = ticket.events;
            const batch = ticket.ticket_batches;

            const unlockHours = event?.ticket_unlock_hours ?? 2;
            const unlockLabel = formatUnlockLabel(unlockHours);

            const startAt = event?.start_at ? new Date(event.start_at) : null;
            const endAt = event?.end_at
              ? new Date(event.end_at)
              : startAt
              ? new Date(startAt.getTime() + 2 * 60 * 60 * 1000)
              : null;
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
            const isResellable =
              !ticket.used_at &&
              (ticket.status === "VALID" || ticket.status === "ACTIVE");
            const resaleId = resaleByTicketId[ticket.id];
            const canCancelResale =
              ticket.status === "EN_REVENTE" && Boolean(resaleId);
            const isExpired = endAt ? nowTs > endAt.getTime() : false;

            return (
              <div key={ticket.id} className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-2">
                    <div className="text-xs text-white/50">Billet</div>
                    <h2 className="text-xl font-semibold">{event?.title ?? "Événement"}</h2>
                    <p className="text-sm text-white/70">
                      {event?.start_at ? new Date(event.start_at).toLocaleString() : "Date à confirmer"}
                    </p>
                    <p className="text-sm text-white/60">
                      {event?.city ?? "Ville à confirmer"}
                      {event?.venue_name ? ` · ${event.venue_name}` : ""}
                    </p>
                    <p className="text-sm text-white/70">
                      Lot: <span className="text-white">{batch?.name ?? "Standard"}</span>
                    </p>
                  </div>

                  <div className="flex flex-col items-start gap-2 text-sm sm:items-end">
                    <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-white/70">
                      Statut: <span className="text-white">{formatTicketStatus(ticket.status)}</span>
                    </span>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        unlocked ? "bg-[#7A3CFF]/20 text-[#C7B5FF]" : "bg-white/10 text-white/70"
                      }`}
                    >
                      {unlocked ? "UNLOCKED" : "LOCKED"}
                    </span>
                    {isExpired ? (
                      <span className="rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1 text-xs font-semibold text-red-200">
                        Événement terminé
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-white/70">
                  {isExpired ? (
                    <span>Billet expiré — revente et scan désactivés.</span>
                  ) : !unlocked ? (
                    <span>QR disponible à {unlockLabel}.</span>
                  ) : qrToken && staffUrl ? (
                    <div className="space-y-3">
                      <div className="flex flex-col items-center gap-3 rounded-xl bg-white/5 p-3 text-center sm:flex-row sm:items-start sm:text-left">
                        <QRCodeCanvas value={staffUrl} size={120} bgColor="#0D001C" fgColor="#FFFFFF" />
                        <div className="space-y-2">
                          <p className="text-sm text-white/80">Scan requis pour entrée staff.</p>
                          <button
                            type="button"
                            onClick={() => handleShowCode(ticket.id)}
                            className="inline-flex items-center justify-center rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium hover:bg-white/10"
                          >
                            Afficher le code pour le staff
                          </button>
                          {secondsLeft !== null ? (
                            <p className="text-xs text-white/60">Expire dans {secondsLeft} sec</p>
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
                              onClick={() => handleCopyCode(ticket.id, qrToken)}
                              className="inline-flex items-center justify-center rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-xs font-medium hover:bg-white/10"
                            >
                              {copied ? "Copié" : "Copier"}
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <span>QR prêt (prochaine étape).</span>
                  )}
                </div>

                {unlocked && !isExpired ? (
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => fetchQrToken(ticket.id)}
                      disabled={qrBusy}
                      className="inline-flex items-center justify-center rounded-xl bg-[#7A3CFF] px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-60"
                    >
                      {qrToken ? "Rafraîchir QR" : "Afficher QR"}
                    </button>
                    {qrErrorMessage ? <span className="text-sm text-red-200">{qrErrorMessage}</span> : null}
                  </div>
                ) : null}

                {isResellable && !isExpired ? (
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
                      <span className="text-sm text-red-200">{resaleErrorMessage}</span>
                    ) : null}
                  </div>
                ) : null}
                {canCancelResale ? (
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
                      <span className="text-sm text-red-200">{resaleErrorMessage}</span>
                    ) : null}
                  </div>
                ) : null}

                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-xs text-white/50">Ticket ID: {ticket.id}</div>
                  <Link
                    href={`/events/${ticket.event_id}`}
                    className="inline-flex items-center justify-center rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium hover:bg-white/10"
                  >
                    Voir l&apos;événement
                  </Link>
                </div>
              </div>
            );
                })}
              </div>
            );

            return (
              <div className="space-y-6">
                <div className="space-y-3">
                  <h2 className="text-lg font-semibold">Tickets actifs</h2>
                  {activeTickets.length === 0 ? (
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-white/70">
                      Aucun ticket actif.
                    </div>
                  ) : (
                    renderList(activeTickets)
                  )}
                </div>
                <div className="space-y-3">
                  <h2 className="text-lg font-semibold">Tickets passés</h2>
                  {pastTickets.length === 0 ? (
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-white/70">
                      Aucun ticket passé.
                    </div>
                  ) : (
                    renderList(pastTickets)
                  )}
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </section>
  );
}
