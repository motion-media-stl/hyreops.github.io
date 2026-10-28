import type { Campaign, Client, DailyPoint, TrackerData } from "./types";
import type { MonthSel } from "./format";
import { assignColors } from "./colors";

const API_VERSION = process.env.META_API_VERSION || "v26.0";
const GRAPH = `${process.env.META_GRAPH_BASE || "https://graph.facebook.com"}/${API_VERSION}`;

/** How long Meta responses are cached before the next visit pulls fresh numbers (seconds). */
export const CACHE_SECONDS = 3600;
/** Finished months barely change (Meta can adjust the last day or two), so they're cached for a day. */
const PAST_MONTH_CACHE_SECONDS = 86400;

/** Currencies Meta reports budgets in without a minor unit (offset 1 instead of 100). */
const ZERO_DECIMAL = new Set([
  "CLP", "COP", "CRC", "HUF", "ISK", "IDR", "JPY", "KRW", "PYG", "TWD", "VND",
]);

type Paged<T> = { data: T[]; paging?: { next?: string } };

class MetaError extends Error {}

async function graphGet<T>(url: string, cacheSeconds = CACHE_SECONDS): Promise<T> {
  const res = await fetch(url, {
    next: { revalidate: cacheSeconds, tags: ["meta"] },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.error) {
    const msg = body?.error?.message || `HTTP ${res.status}`;
    throw new MetaError(msg);
  }
  return body as T;
}

/** Follows Meta's cursor pagination until every page is collected. */
async function getAll<T>(path: string, params: Record<string, string>, cacheSeconds = CACHE_SECONDS): Promise<T[]> {
  const token = process.env.META_ACCESS_TOKEN!;
  const qs = new URLSearchParams({ ...params, access_token: token });
  let url: string | undefined = `${GRAPH}/${path}?${qs.toString()}`;
  const out: T[] = [];
  let guard = 0;
  while (url && guard < 50) {
    const page: Paged<T> = await graphGet<Paged<T>>(url, cacheSeconds);
    out.push(...(page.data || []));
    url = page.paging?.next;
    guard++;
  }
  return out;
}

const num = (v: unknown) => {
  const n = parseFloat(String(v ?? "0"));
  return Number.isFinite(n) ? n : 0;
};

type AccountInfo = {
  id: string;
  name: string;
  currency: string;
  timezone_name: string;
  account_status: number;
};

/**
 * Which ad accounts to show. If META_AD_ACCOUNT_IDS is set, only those.
 * Otherwise every active ad account the token can see, so a new client shows
 * up automatically once you assign their ad account to the System User.
 */
async function listAccounts(): Promise<AccountInfo[]> {
  const fields = "id,name,currency,timezone_name,account_status";
  const explicit = (process.env.META_AD_ACCOUNT_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((id) => (id.startsWith("act_") ? id : `act_${id}`));

  if (explicit.length) {
    const token = process.env.META_ACCESS_TOKEN!;
    return Promise.all(
      explicit.map((id) =>
        graphGet<AccountInfo>(`${GRAPH}/${id}?fields=${fields}&access_token=${token}`)
      )
    );
  }

  const all = await getAll<AccountInfo>("me/adaccounts", { fields, limit: "200" });
  // Skip accounts that are disabled (2), pending closure (100), or closed (101).
  // Accounts with a billing hold or under review still count, since they may have spent this month.
  return all.filter((a) => ![2, 100, 101].includes(a.account_status));
}

type CampaignRow = {
  id: string;
  name: string;
  objective?: string;
  daily_budget?: string;
  lifetime_budget?: string;
};
type AdSetRow = { campaign_id: string; daily_budget?: string; lifetime_budget?: string };
type InsightRow = {
  campaign_id?: string;
  campaign_name?: string;
  objective?: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  date_start?: string;
  actions?: { action_type: string; value: string }[];
};

/**
 * Leads as Ads Manager counts them. Meta's combined "lead" action covers
 * Instant Form leads and website (pixel) leads together; if an account only
 * returns the individual types, add those up instead. Uses each ad account's
 * default attribution setting, same as the Results column in Ads Manager.
 */
function leadsFrom(row?: InsightRow): number {
  const acts = row?.actions || [];
  const find = (t: string) => acts.find((a) => a.action_type === t);
  const combined = find("lead");
  if (combined) return num(combined.value);
  return ["onsite_conversion.lead_grouped", "offsite_conversion.fb_pixel_lead"]
    .reduce((s, t) => s + num(find(t)?.value), 0);
}

/**
 * A finished month. There's no "active" for a past month, so the campaign list
 * is every campaign that spent during it, straight from that month's insights.
 */
async function loadPastMonth(acct: AccountInfo, m: MonthSel, base: Client): Promise<Client> {
  const range = { time_range: JSON.stringify({ since: m.since, until: m.until }) };
  const ttl = PAST_MONTH_CACHE_SECONDS;

  const [rows, daily] = await Promise.all([
    getAll<InsightRow>(`${acct.id}/insights`, {
      ...range,
      level: "campaign",
      fields: "campaign_id,campaign_name,objective,spend,impressions,clicks,actions",
      limit: "500",
    }, ttl),
    getAll<InsightRow>(`${acct.id}/insights`, {
      ...range,
      time_increment: "1",
      fields: "spend",
      limit: "100",
    }, ttl),
  ]);

  base.campaigns = rows
    .map<Campaign>((r) => ({
      id: r.campaign_id || "",
      name: r.campaign_name || r.campaign_id || "Unnamed campaign",
      objective: r.objective || "",
      dailyBudget: null,
      lifetimeBudget: null,
      spendToday: 0,
      spendYesterday: 0,
      spendMTD: num(r.spend),
      impressions: num(r.impressions),
      clicks: num(r.clicks),
      leadsYesterday: 0,
      leadsMTD: leadsFrom(r),
    }))
    .filter((c) => c.spendMTD > 0 || c.impressions > 0)
    .sort((a, b) => b.spendMTD - a.spendMTD);

  base.spendMTD = rows.reduce((s, r) => s + num(r.spend), 0);
  base.leadsMTD = rows.reduce((s, r) => s + leadsFrom(r), 0);
  base.leadSpendMTD = rows.reduce((s, r) => s + (leadsFrom(r) > 0 ? num(r.spend) : 0), 0);
  base.daily = daily
    .map<DailyPoint>((d) => ({ date: d.date_start || "", spend: num(d.spend) }))
    .filter((d) => d.date)
    .sort((a, b) => a.date.localeCompare(b.date));
  return base;
}

async function loadClient(acct: AccountInfo, m: MonthSel): Promise<Client> {
  const base: Client = {
    accountId: acct.id,
    name: acct.name,
    currency: acct.currency || "USD",
    timezone: acct.timezone_name || "",
    campaigns: [],
    spendToday: 0,
    spendYesterday: 0,
    spendMTD: 0,
    leadsYesterday: 0,
    leadsMTD: 0,
    leadSpendMTD: 0,
    daily: [],
  };

  try {
    if (!m.isCurrent) return await loadPastMonth(acct, m, base);

    const offset = ZERO_DECIMAL.has(base.currency) ? 1 : 100;
    const active = JSON.stringify(["ACTIVE"]);

    const [campaigns, adsets, mtd, yesterday, today, daily] = await Promise.all([
      getAll<CampaignRow>(`${acct.id}/campaigns`, {
        fields: "id,name,objective,daily_budget,lifetime_budget",
        effective_status: active,
        limit: "200",
      }),
      getAll<AdSetRow>(`${acct.id}/adsets`, {
        fields: "campaign_id,daily_budget,lifetime_budget",
        effective_status: active,
        limit: "500",
      }),
      getAll<InsightRow>(`${acct.id}/insights`, {
        level: "campaign",
        date_preset: "this_month",
        fields: "campaign_id,spend,impressions,clicks,actions",
        limit: "500",
      }),
      getAll<InsightRow>(`${acct.id}/insights`, {
        level: "campaign",
        date_preset: "yesterday",
        fields: "campaign_id,spend,actions",
        limit: "500",
      }),
      getAll<InsightRow>(`${acct.id}/insights`, {
        level: "campaign",
        date_preset: "today",
        fields: "campaign_id,spend",
        limit: "500",
      }),
      getAll<InsightRow>(`${acct.id}/insights`, {
        date_preset: "this_month",
        time_increment: "1",
        fields: "spend",
        limit: "100",
      }),
    ]);

    const byId = (rows: InsightRow[]) =>
      new Map(rows.map((r) => [r.campaign_id || "", r]));
    const mtdMap = byId(mtd);
    const yMap = byId(yesterday);
    const tMap = byId(today);

    // Campaigns using ad set budgets (ABO) have no campaign budget; roll the ad sets up instead.
    const adsetBudgets = new Map<string, { daily: number; lifetime: number }>();
    for (const a of adsets) {
      const cur = adsetBudgets.get(a.campaign_id) || { daily: 0, lifetime: 0 };
      cur.daily += num(a.daily_budget) / offset;
      cur.lifetime += num(a.lifetime_budget) / offset;
      adsetBudgets.set(a.campaign_id, cur);
    }

    base.campaigns = campaigns
      .map<Campaign>((c) => {
        const m = mtdMap.get(c.id);
        const ab = adsetBudgets.get(c.id);
        const cDaily = num(c.daily_budget) / offset;
        const cLife = num(c.lifetime_budget) / offset;
        return {
          id: c.id,
          name: c.name,
          objective: c.objective || "",
          dailyBudget: cDaily || ab?.daily || null,
          lifetimeBudget: cLife || ab?.lifetime || null,
          spendToday: num(tMap.get(c.id)?.spend),
          spendYesterday: num(yMap.get(c.id)?.spend),
          spendMTD: num(m?.spend),
          impressions: num(m?.impressions),
          clicks: num(m?.clicks),
          leadsYesterday: leadsFrom(yMap.get(c.id)),
          leadsMTD: leadsFrom(m),
        };
      })
      .sort((a, b) => b.spendMTD - a.spendMTD);

    // Account totals come from insights, so spend from campaigns that were
    // paused or ended earlier in the month still counts toward the month.
    base.spendMTD = mtd.reduce((s, r) => s + num(r.spend), 0);
    base.spendYesterday = yesterday.reduce((s, r) => s + num(r.spend), 0);
    base.spendToday = today.reduce((s, r) => s + num(r.spend), 0);
    base.leadsMTD = mtd.reduce((s, r) => s + leadsFrom(r), 0);
    base.leadSpendMTD = mtd.reduce((s, r) => s + (leadsFrom(r) > 0 ? num(r.spend) : 0), 0);
    base.leadsYesterday = yesterday.reduce((s, r) => s + leadsFrom(r), 0);
    base.daily = daily
      .map<DailyPoint>((d) => ({ date: d.date_start || "", spend: num(d.spend) }))
      .filter((d) => d.date)
      .sort((a, b) => a.date.localeCompare(b.date));
  } catch (e) {
    base.error = e instanceof Error ? e.message : String(e);
  }

  return base;
}

/** Runs async work with a cap on how many accounts are fetched at once. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>) {
  const out: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return out;
}

export async function getTrackerData(m: MonthSel): Promise<TrackerData> {
  if (!process.env.META_ACCESS_TOKEN) {
    const { demoData } = await import("./demo");
    return demoData(m);
  }

  let accounts: AccountInfo[];
  try {
    accounts = await listAccounts();
  } catch (e) {
    return {
      clients: [],
      fetchedAt: new Date().toISOString(),
      demo: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
  let clients = assignColors(await mapLimit(accounts, 4, (a) => loadClient(a, m)));
  // For a past month, only show accounts that actually ran ads that month.
  if (!m.isCurrent) clients = clients.filter((c) => c.error || c.spendMTD > 0 || c.campaigns.length > 0);
  clients.sort((a, b) => b.spendMTD - a.spendMTD);

  return { clients, fetchedAt: new Date().toISOString(), demo: false };
}
