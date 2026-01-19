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

  const buyParam = searchParams.get("buy");
  const isLoggedIn = Boolean(userEmail);

  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);
      setError(null);

      const res = await fetch("/api/resale/list", { cache: "no-store" });
      const payload = await res.json().catch(() => ({}));

      if (!mounted) return;

      if (!res.ok) {
        setError(payload?.error || "Erreur de chargement.");
        setRows([]);
        setLoading(false);
        return;
      }

      setRows((payload?.data ?? []) as ResaleRow[]);
      setLoading(false);
    }

    load();

    return () => {
      mounted = false;
    };
  }, []);

  const formattedRows = useMemo(() => {
    return rows.map((row) => {
      const eventInfo = Array.isArray(row.events) ? row.events[0] : row.events;
      const price = (row.price_cents / 100).toFixed(2);
      return { ...row, eventInfo, price };
    });
  }, [rows]);

  async function startCheckout(resaleId: string) {
    setBuying((prev) => ({ ...prev, [resaleId]: true }));
    setError(null);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;

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

      router.replace("/marketplace");
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
      <div>
        <h1 className="text-3xl font-bold">Marketplace</h1>
        <p className="mt-2 text-white/70">
          Billets en revente disponibles sans inscription.
        </p>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-200">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-white/70">
          Chargement…
        </div>
      ) : formattedRows.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-white/70">
          Aucun billet en revente pour l’instant.
        </div>
      ) : (
        <div className="grid gap-4">
          {formattedRows.map((row) => (
            <div
              key={row.id}
              className="rounded-2xl border border-white/10 bg-white/5 p-5"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                  <h2 className="text-lg font-semibold">
                    {row.eventInfo?.title ?? "Billet en revente"}
                  </h2>
                  <p className="text-sm text-white/70">
                    {row.eventInfo?.start_at
                      ? new Date(row.eventInfo.start_at).toLocaleString()
                      : "Date à confirmer"}
                  </p>
                  <p className="text-sm text-white/60">
                    {row.eventInfo?.city ?? "Ville à confirmer"}
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
                    onClick={() => startCheckout(row.id)}
                    disabled={buying[row.id]}
                    className="inline-flex items-center justify-center rounded-xl bg-[#7A3CFF] px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-60"
                  >
                    {buying[row.id] ? "Redirection…" : "Acheter"}
                  </button>
                  <p className="text-xs text-white/60">
                    La redistribution financière au revendeur sera traitée ultérieurement.
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
