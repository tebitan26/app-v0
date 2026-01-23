"use client";

import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

type Role = "FAN" | "ORGANIZER" | "STAFF" | "ADMIN";

type SessionResponse = {
  authenticated: boolean;
  userId?: string;
  email?: string;
  role?: string | null;
};

function isRole(value: any): value is Role {
  return value === "FAN" || value === "ORGANIZER" || value === "STAFF" || value === "ADMIN";
}

export function useSessionProfile() {
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [role, setRole] = useState<Role | null>(null);

  useEffect(() => {
    let isMounted = true;
    let timeoutId: NodeJS.Timeout | null = null;

    async function fetchSession() {
      try {
        const res = await fetch("/api/session", {
          cache: "no-store",
        });

        if (!isMounted) return;

        if (!res.ok) {
          setUserEmail(null);
          setRole(null);
          setUserId(null);
          setLoading(false);
          return;
        }

        const data: SessionResponse = await res.json();

        if (!isMounted) return;

        if (!data.authenticated || !data.email) {
          setUserEmail(null);
          setRole(null);
          setUserId(null);
          setLoading(false);
          return;
        }

        setUserEmail(data.email);
        const nextRole = isRole(data.role) ? (data.role as Role) : null;
        setRole(nextRole);

        // Fallback: some setups return a valid session but role can be null/undefined.
        // In that case, fetch it directly from `profiles` (RLS allows self-read).
        if (!nextRole && data.userId) {
          try {
            const { data: prof } = await supabase
              .from("profiles")
              .select("role")
              .eq("id", data.userId)
              .maybeSingle();

            if (!isMounted) return;
            const profRole = isRole(prof?.role) ? (prof!.role as Role) : null;
            setRole(profRole);
          } catch {
            // ignore fallback errors; role remains null
          }
        }

        setUserId(data.userId ?? null);
        setLoading(false);
      } catch (error) {
        // On fetch failure, treat as logged out
        if (!isMounted) return;
        setUserEmail(null);
        setRole(null);
        setUserId(null);
        setLoading(false);
      }
    }

    async function load() {
      if (!isMounted) return;
      setLoading(true);
      await fetchSession();
    }

    load();

    // Use onAuthStateChange as a trigger to refetch from server
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      if (isMounted) {
        setLoading(true);
        fetchSession();
      }
    });

    // Timeout safety: if loading takes too long, stop loading
    timeoutId = setTimeout(() => {
      if (isMounted) {
        // Only stop loading if we still don't know the session.
        setLoading((prev) => (prev ? false : prev));
      }
    }, 5000);

    return () => {
      isMounted = false;
      if (timeoutId) clearTimeout(timeoutId);
      sub.subscription.unsubscribe();
    };
  }, []);

  return { loading, userId, userEmail, role };
}
