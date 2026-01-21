export const dynamic = "force-dynamic";

import { Suspense } from "react";
import LoginClient from "./LoginClient";

type SP = { [key: string]: string | string[] | undefined };

export default function LoginPage({ searchParams }: { searchParams?: SP }) {
  const raw = searchParams?.error;
  const error = Array.isArray(raw) ? raw[0] : raw;
  const initialError = error === "missing_code" || error === "oauth" ? error : null;

  return (
    <Suspense fallback={<main className="flex min-h-screen items-center justify-center"><p className="text-sm text-neutral-500">Chargement...</p></main>}>
      <LoginClient initialError={initialError} />
    </Suspense>
  );
}
