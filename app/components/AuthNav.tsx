"use client";

import Link from "next/link";
import { supabase } from "../lib/supabaseClient";
import { useSessionProfile } from "../lib/useSessionProfile";

export default function AuthNav() {
  const { loading, userEmail, role } = useSessionProfile();

  async function logout() {
    await supabase.auth.signOut();
    // Force a full refresh so header state updates immediately
    window.location.href = "/";
  }

  if (loading) return <div className="text-sm text-white/50">…</div>;

  if (!userEmail) {
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
        {userEmail} <span className="text-[#7A3CFF]">({role ?? "?"})</span>
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