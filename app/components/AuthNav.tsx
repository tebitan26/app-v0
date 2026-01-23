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
  const [loadingTimedOut, setLoadingTimedOut] = useState(false);

  useEffect(() => {
    if (userEmail) {
      setCached({ userEmail, role: role ?? null });
    }
  }, [userEmail, role]);

  useEffect(() => {
    // If the hook stays in loading too long (e.g., network/env issue),
    // fall back to showing the Login link instead of an infinite "…".
    if (loading) {
      setLoadingTimedOut(false);
      const t = window.setTimeout(() => setLoadingTimedOut(true), 2500);
      return () => window.clearTimeout(t);
    }

    // When loading finishes, reset the timeout flag.
    setLoadingTimedOut(false);
    return;
  }, [loading]);

  async function logout() {
    await supabase.auth.signOut();
    // Force a full refresh so header state updates immediately
    window.location.href = "/";
  }

  const effectiveEmail = userEmail ?? cached?.userEmail ?? null;
  const effectiveRole = role ?? cached?.role ?? null;

  const roleUpper = (effectiveRole ?? "").toUpperCase();
  const canSeeOrganizer = roleUpper === "ORGANIZER" || roleUpper === "ADMIN";
  // V0 rule: organizers CAN also access staff scan, staff cannot access organizer.
  const canSeeStaff = roleUpper === "STAFF" || roleUpper === "ADMIN" || roleUpper === "ORGANIZER";

  const publicLinks = (
    <>
      <Link
        href="/events"
        className="rounded-xl border border-white/15 bg-white/5 px-3 py-1 text-xs text-white/80 hover:bg-white/10"
      >
        Events
      </Link>
      <Link
        href="/marketplace"
        className="rounded-xl border border-white/15 bg-white/5 px-3 py-1 text-xs text-white/80 hover:bg-white/10"
      >
        Marketplace
      </Link>
    </>
  );

  const roleLabel =
    roleUpper === "ORGANIZER" ? "Organizer" : roleUpper === "STAFF" ? "Staff" : roleUpper === "FAN" ? "Fan" : effectiveRole ?? "?";

  const displayEmail = (() => {
    if (!effectiveEmail) return null;
    const [local, domain] = effectiveEmail.split("@");
    if (!domain) return effectiveEmail;
    const start = local.slice(0, 3);
    const end = local.slice(-2);
    return `${start}…${end}@${domain}`;
  })();

  // While loading, keep a stable placeholder to avoid layout jumps.
  // But if loading seems stuck, show Login rather than an infinite placeholder.
  if (loading && !effectiveEmail && !loadingTimedOut) {
    return (
      <div className="flex items-center gap-3 text-sm">
        {publicLinks}
        <div
          className="text-sm text-white/50 min-w-[80px] text-right"
          aria-label="Chargement du profil"
        >
          …
        </div>
      </div>
    );
  }

  // Not logged in
  if (!effectiveEmail) {
    return (
      <div className="flex items-center gap-3 text-sm">
        {publicLinks}
        <Link className="hover:text-white" href="/login">
          Login
        </Link>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 text-sm">
      {publicLinks}

      {/* Identity (not clickable to avoid duplicate navigation) */}
      <div className="flex items-center gap-2 text-white/70" title={effectiveEmail ?? undefined}>
        <span>
          {displayEmail ?? "…"}
        </span>
        <span
          className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] font-medium tracking-wide text-[#7A3CFF]"
          title="Votre rôle détermine les pages accessibles"
          aria-label={`Rôle: ${roleLabel}`}
        >
          {roleLabel}
        </span>
      </div>

      {/* Quick actions */}
      <Link
        href="/me"
        className="rounded-xl border border-white/15 bg-white/5 px-3 py-1 text-xs text-white/80 hover:bg-white/10"
        title="Mon profil"
      >
        Profil
      </Link>

      <Link
        href="/me/tickets"
        className="rounded-xl border border-white/15 bg-white/5 px-3 py-1 text-xs text-white/80 hover:bg-white/10"
        title="Mes billets"
      >
        Mes billets
      </Link>

      {canSeeStaff ? (
        <Link
          href="/staff"
          className="rounded-xl border border-white/15 bg-white/5 px-3 py-1 text-xs text-white/80 hover:bg-white/10"
          title="Scanner / valider des billets"
        >
          Staff scanner
        </Link>
      ) : null}

      {canSeeOrganizer ? (
        <Link
          href="/org"
          className="rounded-xl border border-white/15 bg-white/5 px-3 py-1 text-xs text-white/80 hover:bg-white/10"
          title="Dashboard organisateur"
        >
          Organisateur
        </Link>
      ) : null}

      <button onClick={logout} className="hover:text-white text-white/70">
        Logout
      </button>
    </div>
  );
}
