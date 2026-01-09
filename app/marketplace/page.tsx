import { Suspense } from "react";
import MarketplaceClient from "./MarketplaceClient";

export default function MarketplacePage() {
  return (
    <Suspense
      fallback={
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-white/70">
          Chargement…
        </div>
      }
    >
      <MarketplaceClient />
    </Suspense>
  );
}
