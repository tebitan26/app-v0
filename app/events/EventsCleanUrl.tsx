"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function EventsCleanUrl() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (searchParams.get("fromAuth") === "1") {
      router.replace("/events");
    }
  }, [searchParams, router]);

  return null;
}
