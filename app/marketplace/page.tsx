"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import MarketplaceClient from "./MarketplaceClient";

export default function MarketplacePage() {
  const [refreshKey, setRefreshKey] = useState(0);

  const fallback = useMemo(
    () => (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-white/70">
        Chargement…
      </div>
    ),
    []
  );

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold">Marketplace</h1>
          <p className="text-white/70">
            Revente officielle : achète un billet en quelques secondes.
          </p>
          <div className="text-xs text-white/50">
            Paiement possible sans compte — un compte est créé avant le paiement
            pour sécuriser ton billet.
          </div>
        </div>

        <div className="flex w-full flex-col gap-2 sm:w-auto">
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center">
            <Link
              href="/events"
              className="inline-flex items-center justify-center rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-white hover:bg-white/10"
            >
              Voir les évènements
            </Link>
            <button
              type="button"
              onClick={() => setRefreshKey((k) => k + 1)}
              className="inline-flex items-center justify-center rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-white hover:bg-white/10"
            >
              Rafraîchir
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70">
              Revente officielle
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70">
              Anti-fraude
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70">
              Prix plafonné + frais 10%
            </span>
          </div>
        </div>
      </div>

      <Suspense fallback={fallback}>
        <MarketplaceClient key={refreshKey} />
      </Suspense>
    </section>
  );
}
