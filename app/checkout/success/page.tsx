import { Suspense } from "react";
import SuccessClient from "./SuccessClient";

export default function CheckoutSuccessPage() {
  return (
    <Suspense fallback="Chargement…">
      <SuccessClient />
    </Suspense>
  );
}
