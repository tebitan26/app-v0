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
      <span className="text-white/70">
        {userEmail} <span className="text-[#7A3CFF]">({role ?? "?"})</span>
      </span>
      <button onClick={logout} className="hover:text-white text-white/70">
        Logout
      </button>
    </div>
  );
}