"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/app/lib/supabaseClient";
import { useSessionProfile } from "@/app/lib/useSessionProfile";

type ResaleRow = {
  id: string;
  ticket_id: string;
  event_id: string;
  price_cents: number;
  currency: string;
  created_at: string | null;
  events?: {
    title: string | null;
    city: string | null;
    start_at: string | null;
  } | null;
};

export default function MarketplaceClient() {
  const { loading: profileLoading, userEmail } = useSessionProfile();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<ResaleRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [buying, setBuying] = useState<Record<string, boolean>>({});
  const autoBuyRef = useRef(false);
  const [query, setQuery] = useState("");
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  const buyParam = searchParams.get("buy");
  const isLoggedIn = Boolean(userEmail);

  async function reloadRows() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/resale/list", { cache: "no-store" });
      const payload = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(payload?.error || "Erreur de chargement.");
        setRows([]);
        return;
      }

      setRows((payload?.data ?? []) as ResaleRow[]);
    } catch {
      setError("Erreur réseau.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let mounted = true;

    (async () => {
      if (!mounted) return;
      await reloadRows();
    })();

    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function safeDate(iso: string | null | undefined) {
    if (!iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return d;
  }

  function formatDate(iso: string | null | undefined) {
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

  const formattedRows = useMemo(() => {
    return rows.map((row) => {
      const eventInfo = Array.isArray(row.events) ? row.events[0] : row.events;
      const price = (row.price_cents / 100).toFixed(2);
      return { ...row, eventInfo, price };
    });
  }, [rows]);

  type FormattedRow = (typeof formattedRows)[number];

  type Group = {
    key: string;
    event_id: string;
    title: string;
    city: string | null;
    start_at: string | null;
    tickets: FormattedRow[];
  };

  const groupedRows = useMemo(() => {
    const q = query.trim().toLowerCase();

    const map = new Map<string, Group>();

    for (const row of formattedRows) {
      const title = row.eventInfo?.title ?? "Événement";
      const city = row.eventInfo?.city ?? null;
      const start_at = row.eventInfo?.start_at ?? null;

      const hay = `${title} ${city ?? ""}`.toLowerCase();
      if (q && !hay.includes(q)) continue;

      const key = row.event_id || `${title}:${start_at ?? "unknown"}`;

      const existing = map.get(key);
      if (existing) {
        existing.tickets.push(row);
      } else {
        map.set(key, {
          key,
          event_id: row.event_id,
          title,
          city,
          start_at,
          tickets: [row],
        });
      }
    }

    const groups = Array.from(map.values());

    // Sort groups by start date (ascending)
    groups.sort((a, b) => {
      const da = safeDate(a.start_at)?.getTime() ?? 0;
      const db = safeDate(b.start_at)?.getTime() ?? 0;
      return da - db;
    });

    // Sort tickets inside each group by price (ascending)
    groups.forEach((g) => {
      g.tickets.sort((a, b) => a.price_cents - b.price_cents);
    });

    return groups;
  }, [formattedRows, query]);

  async function startCheckout(resaleId: string) {
    setBuying((prev) => ({ ...prev, [resaleId]: true }));
    setError(null);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;

      // UX: purchase can start without having a Sidetick account beforehand,
      // but we must authenticate before Stripe to safely associate the ticket.
      if (!accessToken) {
        window.location.href = `/login?next=${encodeURIComponent(
          "/marketplace"
        )}&buy=${encodeURIComponent(resaleId)}`;
        return;
      }

      const res = await fetch("/api/resale/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ resale_id: resaleId }),
      });

      const payload = await res.json().catch(() => ({}));

      if (res.status === 401) {
        window.location.href = `/login?next=${encodeURIComponent(
          "/marketplace"
        )}&buy=${encodeURIComponent(resaleId)}`;
        return;
      }

      if (!res.ok || !payload?.url) {
        if (res.status === 409 || res.status === 400) {
          setError("Billet indisponible.");
        } else {
          setError(payload?.error || "Impossible de lancer le paiement.");
        }
        return;
      }

      window.location.href = payload.url as string;
    } catch {
      setError("Erreur réseau.");
    } finally {
      setBuying((prev) => ({ ...prev, [resaleId]: false }));
    }
  }

  useEffect(() => {
    if (!buyParam || !isLoggedIn || profileLoading) return;
    if (autoBuyRef.current) return;

    autoBuyRef.current = true;
    startCheckout(buyParam);
  }, [buyParam, isLoggedIn, profileLoading]);

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold">Marketplace</h1>
          <p className="mt-2 text-white/70">
            Billets en revente disponibles sans inscription.
          </p>
          {!loading ? (
            <div className="text-xs text-white/50">
              {groupedRows.length === 0
                ? "0 événement"
                : groupedRows.length === 1
                ? "1 événement"
                : `${groupedRows.length} événements`}
            </div>
          ) : null}
        </div>

        <div className="flex w-full flex-col gap-2 sm:w-auto">
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative w-full sm:w-[360px]">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Rechercher (événement, ville)"
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
              onClick={() => router.push("/events")}
              className="inline-flex items-center justify-center rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-white hover:bg-white/10"
            >
              Voir les évènements
            </button>

            <button
              type="button"
              onClick={() => reloadRows()}
              disabled={loading}
              className="inline-flex items-center justify-center rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-white hover:bg-white/10 disabled:opacity-60"
            >
              {loading ? "Chargement…" : "Rafraîchir"}
            </button>
          </div>

          <div className="flex flex-wrap gap-2 text-xs text-white/70">
            <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1">
              Revente officielle
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1">
              Anti-fraude
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1">
              Prix plafonné + frais 10%
            </span>
          </div>
        </div>
      </div>

      {!isLoggedIn && (
        <div className="rounded-2xl border border-blue-500/30 bg-blue-500/10 p-4 text-sm text-blue-100">
          <strong>Achat rapide.</strong>
          <p className="mt-1 text-blue-100/80">
            Vous pouvez commencer l’achat sans compte Sidetick au préalable.
            Avant le paiement, nous vous demanderons de vous connecter (Google ou magic link)
            pour associer le billet à votre compte et sécuriser l’accès.
          </p>
        </div>
      )}

      {error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-200">
          <div>{error}</div>
          <button
            type="button"
            onClick={() => {
              if (loading) return;
              reloadRows();
            }}
            className="mt-3 inline-flex items-center justify-center rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-white hover:bg-white/10"
          >
            Réessayer
          </button>
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-white/70">
          Chargement…
        </div>
      ) : groupedRows.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-7">
          <div className="space-y-2">
            <h2 className="text-lg font-semibold">Aucune revente disponible pour le moment</h2>
            <p className="text-sm text-white/70">
              La marketplace Sidetick affiche uniquement des reventes officielles (prix plafonnés + frais 10%).
            </p>
          </div>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => router.push("/events")}
              className="inline-flex items-center justify-center rounded-xl bg-[#7A3CFF] px-4 py-2 text-sm font-medium hover:opacity-90"
            >
              Voir les évènements
            </button>

            <button
              type="button"
              onClick={() => router.refresh()}
              className="inline-flex items-center justify-center rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-white hover:bg-white/10"
            >
              Rafraîchir
            </button>
          </div>

          <p className="mt-4 text-xs text-white/50">
            Les reventes apparaissent quand des fans remettent leurs billets en vente.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {groupedRows.map((g) => {
            const isOpen = openGroups[g.key] ?? true;

            const minPrice = g.tickets.length
              ? (Math.min(...g.tickets.map((t) => t.price_cents)) / 100).toFixed(2)
              : null;
            const maxPrice = g.tickets.length
              ? (Math.max(...g.tickets.map((t) => t.price_cents)) / 100).toFixed(2)
              : null;

            const priceLabel =
              minPrice && maxPrice
                ? minPrice === maxPrice
                  ? `${minPrice} ${g.tickets[0].currency ?? "EUR"}`
                  : `${minPrice}–${maxPrice} ${g.tickets[0].currency ?? "EUR"}`
                : "";

            return (
              <div
                key={g.key}
                className="rounded-2xl border border-white/10 bg-white/5"
              >
                <button
                  type="button"
                  onClick={() =>
                    setOpenGroups((prev) => ({ ...prev, [g.key]: !isOpen }))
                  }
                  className="flex w-full items-start justify-between gap-4 px-5 py-4 text-left"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-lg font-semibold">
                        {g.title}
                      </h2>
                      <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-white/70">
                        {g.tickets.length} billet{g.tickets.length > 1 ? "s" : ""} en revente
                      </span>
                    </div>

                    <p className="mt-2 text-sm text-white/80">
                      {formatDate(g.start_at)}
                    </p>

                    <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-white/60">
                      <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-xs">
                        {g.city ?? "Ville à confirmer"}
                      </span>
                      {priceLabel ? (
                        <span className="text-xs text-white/70">
                          À partir de <span className="text-white">{priceLabel}</span>
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="shrink-0 text-xs text-white/70">
                    {isOpen ? "Masquer" : "Afficher"}
                  </div>
                </button>

                {isOpen ? (
                  <div className="border-t border-white/10 px-5 py-4">
                    <div className="space-y-3">
                      {g.tickets.map((row) => (
                        <div
                          key={row.id}
                          className="flex flex-col gap-3 rounded-xl border border-white/10 bg-black/20 p-4 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div className="min-w-0">
                            <div className="text-sm text-white/70">
                              Billet disponible
                            </div>
                            <div className="mt-1 text-xs text-white/50">
                              Ticket: {row.ticket_id}
                            </div>
                          </div>

                          <div className="flex flex-col items-start gap-2 sm:items-end">
                            <span className="text-lg font-semibold text-white">
                              {row.price} {row.currency ?? "EUR"}
                            </span>
                            <button
                              type="button"
                              onClick={() => startCheckout(row.id)}
                              disabled={buying[row.id]}
                              className="inline-flex items-center justify-center rounded-xl bg-[#7A3CFF] px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-60"
                            >
                              {buying[row.id]
                                ? "Redirection vers le paiement…"
                                : "Acheter ce billet"}
                            </button>
                            <p className="text-xs text-white/60 text-right">
                              Paiement sécurisé • Revente officielle • Billet garanti
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
