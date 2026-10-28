import type { Client } from "./types";
import { monthOptions } from "./format";
import { demoData } from "./demo";

export type RevenueRow = {
  date: string; // YYYY-MM-DD
  client: string;
  customer: string;
  amount: number;
  source: string;
  adAccount: string;
  id: string;
};

export type RevenueData = {
  rows: RevenueRow[];
  configured: boolean;
  demo: boolean;
  error?: string;
};

/**
 * Reads closed jobs from the Google Sheet's script (see google-apps-script/Code.gs).
 * Cached with the Meta data, so "Refresh now" refreshes both.
 */
export async function getRevenueData(metaIsDemo: boolean): Promise<RevenueData> {
  const url = process.env.REVENUE_SHEET_URL;
  const key = process.env.REVENUE_SHEET_KEY;

  if (!url || !key) {
    if (metaIsDemo) return { rows: demoRevenue(), configured: false, demo: true };
    return { rows: [], configured: false, demo: false };
  }

  try {
    const u = new URL(url);
    u.searchParams.set("key", key);
    const res = await fetch(u.toString(), {
      redirect: "follow",
      next: { revalidate: 3600, tags: ["meta"] },
    });
    const text = await res.text();
    let body: { rows?: RevenueRow[]; error?: string };
    try {
      body = JSON.parse(text);
    } catch {
      throw new Error(
        "the sheet's web app didn't return data. Check that it's deployed with access set to Anyone"
      );
    }
    if (body.error) {
      throw new Error(body.error === "unauthorized" ? "the API key doesn't match the one in the sheet" : body.error);
    }
    const rows = (body.rows || [])
      .filter((r) => r && r.date && r.client && Number(r.amount) > 0)
      .map((r) => ({ ...r, amount: Number(r.amount) }));
    return { rows, configured: true, demo: false };
  } catch (e) {
    return {
      rows: [],
      configured: true,
      demo: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

const normalize = (s: string) =>
  s.toLowerCase()
    .replace(/\b(llc|inc|co|corp|company|the)\b/g, "")
    .replace(/[^a-z0-9]/g, "");

/**
 * Finds which Meta ad account a revenue row belongs to: by ad account ID if the
 * row has one, otherwise by client name (ignoring case, punctuation, and LLC/Inc).
 */
export function matchClient(row: RevenueRow, clients: Client[]): Client | undefined {
  const id = row.adAccount.replace(/^act_/, "").trim();
  if (id) {
    const byId = clients.find((c) => c.accountId.replace(/^act_/, "") === id);
    if (byId) return byId;
  }
  const n = normalize(row.client);
  if (!n) return undefined;
  return (
    clients.find((c) => normalize(c.name) === n) ||
    clients.find((c) => {
      const cn = normalize(c.name);
      return cn.length > 3 && (cn.includes(n) || n.includes(cn));
    })
  );
}

/** Sample closed jobs for the preview: 13 months, each sized to that month's sample leads. */
function demoRevenue(): RevenueRow[] {
  const pad = (n: number) => String(n).padStart(2, "0");
  let seed = 11;
  const rand = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };

  const profiles: Record<string, { avg: number; spread: number; closeRate: number; customers: string[] }> = {
    "Gateway Home Services": { avg: 640, spread: 0.6, closeRate: 0.28, customers: ["M. Alvarez", "J. Brooks", "T. Nguyen", "R. Patel", "K. Smith", "D. Lewis", "A. Carter"] },
    "Lindell Dental Group": { avg: 1450, spread: 0.8, closeRate: 0.22, customers: ["S. Kim", "L. Moore", "P. Grant", "C. Diaz", "E. Walsh"] },
    "Riverside Fitness": { avg: 149, spread: 0.3, closeRate: 0.35, customers: ["B. Young", "N. Hall", "G. Rivera", "H. Scott", "V. Price"] },
  };

  const rows: RevenueRow[] = [];
  let n = 0;
  for (const month of monthOptions().slice(0, 13)) {
    for (const c of demoData(month).clients) {
      const p = profiles[c.name];
      if (!p) continue;
      const jobs = Math.round(c.leadsMTD * p.closeRate * (0.9 + rand() * 0.2));
      for (let j = 0; j < jobs; j++) {
        const day = 1 + Math.floor(rand() * month.day);
        const amount = Math.round(p.avg * (1 - p.spread / 2 + rand() * p.spread) / 5) * 5;
        rows.push({
          date: `${month.year}-${pad(month.month)}-${pad(day)}`,
          client: c.name,
          customer: p.customers[Math.floor(rand() * p.customers.length)],
          amount,
          source: rand() > 0.12 ? "Facebook Lead Form" : "Website",
          adAccount: "",
          id: `demo-${n++}`,
        });
      }
    }
  }
  return rows.sort((a, b) => b.date.localeCompare(a.date));
}
