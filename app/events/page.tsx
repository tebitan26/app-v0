export const dynamic = "force-dynamic";
import { Suspense } from "react";
import EventsClient from "./EventsClient";

export default function EventsPage() {
  return (
    <Suspense fallback={<div />}>
      <EventsClient />
    </Suspense>
  );
}
