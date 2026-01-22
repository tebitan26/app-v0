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
        setRole((data.role as Role) ?? null);
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
        fetchSession();
      }
    });

    // Timeout safety: if loading takes too long, stop loading
    timeoutId = setTimeout(() => {
      if (isMounted) {
        setLoading(false);
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
