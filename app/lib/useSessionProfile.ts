"use client";

import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

type Role = "FAN" | "ORGANIZER" | "STAFF" | "ADMIN";

export function useSessionProfile() {
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [role, setRole] = useState<Role | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      setLoading(true);
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user ?? null;

      if (!isMounted) return;

      setUserId(user?.id ?? null);
      setUserEmail(user?.email ?? null);

      if (!user) {
        setRole(null);
        setLoading(false);
        return;
      }

      const { data: profile, error } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (!isMounted) return;

      if (error) {
        setRole(null);
      } else {
        setRole(profile?.role ?? null);
      }

      setLoading(false);
    }

    load();

    const { data: sub } = supabase.auth.onAuthStateChange(() => load());

    return () => {
      isMounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return { loading, userId, userEmail, role };
}
