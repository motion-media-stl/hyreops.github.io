"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export default function RefreshButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [pending, startTransition] = useTransition();

  async function refresh() {
    setBusy(true);
    try {
      await fetch("/api/refresh", { method: "POST" });
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  const loading = busy || pending;
  return (
    <button className="refresh" onClick={refresh} disabled={loading}>
      {loading ? "Refreshing…" : "Refresh now"}
    </button>
  );
}
