"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useSessionProfile } from "../lib/useSessionProfile";

type CachedProfile = {
  userEmail: string;
  role: string | null;
};

export default function AuthNav() {
  const { loading, userEmail, role } = useSessionProfile();

  // Keep the last known profile so the header doesn't “blink” to … on refresh/navigation
  const [cached, setCached] = useState<CachedProfile | null>(null);

  useEffect(() => {
    if (userEmail) {
      setCached({ userEmail, role: role ?? null });
    }
  }, [userEmail, role]);

  async function logout() {
    await supabase.auth.signOut();
    // Force a full refresh so header state updates immediately
    window.location.href = "/";
  }

  const effectiveEmail = userEmail ?? cached?.userEmail ?? null;
  const effectiveRole = role ?? cached?.role ?? null;

  // While loading, keep a stable placeholder to avoid layout jumps
  if (loading && !effectiveEmail) {
    return (
      <div
        className="text-sm text-white/50 min-w-[220px] text-right"
        aria-label="Chargement du profil"
      >
        Chargement…
      </div>
    );
  }

  // Not logged in
  if (!effectiveEmail) {
    return (
      <Link className="hover:text-white" href="/login">
        Login
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-3 text-sm">
      <Link
        href="/me/tickets"
        className="text-white/70 hover:text-white underline-offset-4 hover:underline"
        title="Mes billets"
      >
        {effectiveEmail}{" "}
        <span className="text-[#7A3CFF]">({effectiveRole ?? "?"})</span>
      </Link>

      <Link
        href="/me/tickets"
        className="rounded-xl border border-white/15 bg-white/5 px-3 py-1 text-xs text-white/80 hover:bg-white/10"
      >
        Mes billets
      </Link>

      <button onClick={logout} className="hover:text-white text-white/70">
        Logout
      </button>
    </div>
  );
}