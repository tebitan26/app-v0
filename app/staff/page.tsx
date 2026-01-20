import { Suspense } from "react";
import StaffClient from "./StaffClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export default function StaffPage() {
  return (
    <Suspense fallback={<p className="text-white/70">Chargement…</p>}>
      <StaffClient />
    </Suspense>
  );
}
