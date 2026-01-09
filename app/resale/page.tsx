"use client";

import { useEffect, useMemo, useState } from "react";
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

export default function ResalePage() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<ResaleRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [buying, setBuying] = useState<Record<string, boolean>>({});

  const hasItems = rows.length > 0;

  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);
      setError(null);

      const res = await fetch("/api/resale/list");
      const payload = await res.json().catch(() => ({}));

      if (!mounted) return;

      if (!res.ok) {
        setError(payload?.error || "Erreur de chargement.");
        setRows([]);
        setLoading(false);
        return;
      }

      const list = (payload?.data ?? []) as ResaleRow[];
      setRows(list);
      setLoading(false);
    }

    load();

    return () => {
      mounted = false;
    };
  }, []);

  const formattedRows = useMemo(() => {
    return rows.map((row) => {
      const price = (row.price_cents / 100).toFixed(2);
      return { ...row, event: row.events ?? null, price };
    });
  }, [rows]);

  async function handleBuy(resaleId: string) {
    setBuying((prev) => ({ ...prev, [resaleId]: true }));
    setError(null);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) {
        setError("Non authentifié.");
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

      if (!res.ok || !payload?.url) {
        setError(payload?.error || "Impossible de lancer le paiement.");
        return;
      }

      window.location.href = payload.url as string;
    } catch {
      setError("Erreur réseau.");
    } finally {
      setBuying((prev) => ({ ...prev, [resaleId]: false }));
    }
  }

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Marketplace</h1>
        <p className="mt-2 text-white/70">
          Billets disponibles à la revente.
        </p>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-200">
          {error}
        </div>
      ) : null}

      {loading ? (
        <p className="text-white/60">Chargement…</p>
      ) : !hasItems ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-white/70">
          Aucun billet disponible en revente.
        </div>
      ) : (
        <div className="grid gap-4">
          {formattedRows.map((row) => {
            const event = row.event;
            return (
              <div
                key={row.id}
                className="rounded-2xl border border-white/10 bg-white/5 p-5"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-1">
                    <h2 className="text-lg font-semibold">
                      {event?.title ?? "Billet en revente"}
                    </h2>
                    <p className="text-sm text-white/70">
                      {event?.start_at
                        ? new Date(event.start_at).toLocaleString()
                        : "Date à confirmer"}
                    </p>
                    <p className="text-sm text-white/60">
                      {event?.city ?? "Ville à confirmer"}
                    </p>
                    <p className="text-xs text-white/50">
                      Ticket: {row.ticket_id}
                    </p>
                  </div>
                  <div className="flex flex-col items-start gap-2 sm:items-end">
                    <span className="text-lg font-semibold text-white">
                      {row.price} {row.currency ?? "EUR"}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleBuy(row.id)}
                      disabled={buying[row.id]}
                      className="inline-flex items-center justify-center rounded-xl bg-[#7A3CFF] px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-60"
                    >
                      {buying[row.id] ? "Redirection…" : "Acheter"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
