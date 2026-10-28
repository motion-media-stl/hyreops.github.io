import { getTrackerData } from "@/lib/meta";
import { getRevenueData, matchClient, type RevenueRow } from "@/lib/revenue";
import { int, money, parseMonth, plural, updatedLabel } from "@/lib/format";
import type { Client } from "@/lib/types";
import { clientColor, initials } from "@/lib/colors";
import type { CSSProperties } from "react";

const tintOf = (c?: Client) => ({ "--c": clientColor(c?.colorIndex) }) as CSSProperties;
import Header from "../Header";

export const dynamic = "force-dynamic";

type PageProps = { searchParams: Promise<{ month?: string | string[] }> };

type ClientStats = {
  key: string;
  name: string;
  client?: Client;
  tracked: boolean; // has at least one closed job on record, any month
  spend: number;
  leads: number;
  jobs: number;
  revenue: number;
};

const roasLabel = (r: number) => `${r.toFixed(r >= 10 ? 0 : 1)}×`;

/** The ROAS a client should hit. Set ROAS_TARGET in Vercel to change it (e.g. 4 for 4×). */
const ROAS_TARGET = Number(process.env.ROAS_TARGET) > 0 ? Number(process.env.ROAS_TARGET) : 3;
const pct = (n: number) => `${Math.round(n * 100)}%`;

export default async function RevenuePage({ searchParams }: PageProps) {
  const month = parseMonth((await searchParams).month);
  const [data, rev] = await Promise.all([getTrackerData(month), getRevenueData(!process.env.META_ACCESS_TOKEN)]);
  const past = !month.isCurrent;
  const clients = data.clients.filter((c) => !c.error);

  // Assign every revenue row to a Meta client (or keep it under its sheet name if no match).
  const stats = new Map<string, ClientStats>();
  for (const c of clients) {
    stats.set(c.accountId, {
      key: c.accountId, name: c.name, client: c, tracked: false,
      spend: c.spendMTD, leads: c.leadsMTD, jobs: 0, revenue: 0,
    });
  }
  const monthJobs: { row: RevenueRow; name: string; client?: Client }[] = [];
  for (const r of rev.rows) {
    const c = matchClient(r, clients);
    const inMonth = r.date.startsWith(month.key);
    // A client counts as "reporting revenue" if they have any job on record, in any month.
    if (c) stats.get(c.accountId)!.tracked = true;
    if (!inMonth) continue;
    const key = c ? c.accountId : `sheet:${r.client.trim().toLowerCase()}`;
    if (!stats.has(key)) {
      stats.set(key, { key, name: r.client, tracked: true, spend: 0, leads: 0, jobs: 0, revenue: 0 });
    }
    const s = stats.get(key)!;
    s.jobs += 1;
    s.revenue += r.amount;
    monthJobs.push({ row: r, name: c?.name || r.client, client: c });
  }

  const tracked = [...stats.values()].filter((s) => s.tracked);
  const untracked = [...stats.values()].filter((s) => !s.tracked && s.client);

  // Totals only include clients that report revenue, so ROAS isn't dragged down by clients you don't track.
  const revenue = tracked.reduce((s, c) => s + c.revenue, 0);
  const jobs = tracked.reduce((s, c) => s + c.jobs, 0);
  // Ratios (ROAS, close rate, cost per job) only use clients matched to a Meta ad account,
  // since revenue with no ad spend behind it would inflate them.
  const matched = tracked.filter((s) => s.client);
  const mRevenue = matched.reduce((s, c) => s + c.revenue, 0);
  const spend = matched.reduce((s, c) => s + c.spend, 0);
  const roas = spend > 0 ? mRevenue / spend : null;

  // Change vs last month. For the current month, compare against the same days of last month
  // (Oct 1–28 vs Sep 1–28) so a month in progress isn't measured against a finished one.
  const prev = new Date(month.year, month.month - 2, 1);
  const prevKey = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;
  const prevShort = prev.toLocaleString("en-US", { month: "short" });
  const prevDays = new Date(prev.getFullYear(), prev.getMonth() + 1, 0).getDate();
  const throughDay = month.isCurrent ? Math.min(month.day, prevDays) : prevDays;
  const prevRevenue = rev.rows
    .filter((r) => r.date.startsWith(prevKey) && Number(r.date.slice(8, 10)) <= throughDay)
    .reduce((s, r) => s + r.amount, 0);
  const change = prevRevenue > 0 ? (revenue - prevRevenue) / prevRevenue : null;
  const changeSub = month.isCurrent
    ? `vs ${prevShort} 1–${throughDay}, ${money(prevRevenue, "USD", true)}`
    : `vs all of ${prev.toLocaleString("en-US", { month: "long" })}, ${money(prevRevenue, "USD", true)}`;

  // ROAS per client, for the target count and best performer. Only clients with ad spend this month.
  const scored = matched
    .filter((s) => s.spend > 0)
    .map((s) => ({ s, r: s.revenue / s.spend }))
    .sort((a, b) => a.r - b.r);
  const above = scored.filter((x) => x.r >= ROAS_TARGET);
  const below = scored.filter((x) => x.r < ROAS_TARGET);
  const best = scored.filter((x) => x.s.revenue > 0).at(-1);
  const targetSub = scored.length === 0
    ? "No ad spend yet"
    : below.length === 0
      ? `All at ${ROAS_TARGET}× or better`
      : `Lowest: ${below[0].s.name} at ${roasLabel(below[0].r)}${below.length > 1 ? `, +${below.length - 1} more` : ""}`;

  const table = tracked.sort((a, b) => b.revenue - a.revenue);

  // Six months of revenue ending at the selected month.
  const thisMonthKey = (() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`;
  })();
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(month.year, month.month - 1 - (5 - i), 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    return {
      key,
      label: d.toLocaleString("en-US", { month: "short" }),
      total: rev.rows.filter((r) => r.date.startsWith(key)).reduce((s, r) => s + r.amount, 0),
      selected: key === month.key,
      partial: key === thisMonthKey,
    };
  });

  const JOB_LIMIT = 50;
  const jobsSorted = monthJobs.sort((a, b) => b.row.date.localeCompare(a.row.date));
  const recent = jobsSorted.slice(0, JOB_LIMIT);

  return (
    <main>
      <Header
        active="revenue"
        eyebrow={`Motion Media · Client revenue · ${month.label}`}
        title="Revenue generated"
        updated={updatedLabel(data.fetchedAt)}
        month={month}
      />

      {past && (
        <div className="past-note">
          Viewing <b>{month.label}</b>: jobs closed that month, measured against that month&rsquo;s ad spend and leads.
        </div>
      )}

      {rev.demo && (
        <div className="notice">
          Showing sample revenue. Connect your GoHighLevel revenue sheet to see real closed jobs (setup steps are in the README).
        </div>
      )}
      {rev.error && (
        <div className="notice notice-error">
          Couldn&rsquo;t read the revenue sheet: {rev.error}.
        </div>
      )}

      {!rev.configured && !rev.demo ? (
        <section className="panel empty">
          <h2>Connect your revenue sheet</h2>
          <p className="muted">
            Once GoHighLevel is sending won opportunities to your Google Sheet, add <code>REVENUE_SHEET_URL</code> and{" "}
            <code>REVENUE_SHEET_KEY</code> in Vercel and redeploy. Closed jobs, revenue, and ROAS for each client will show up here.
          </p>
        </section>
      ) : (
        <>
          <section className="kpis">
            <Kpi label="Revenue" value={money(revenue, "USD", true)} sub={`${past ? month.name : "This month"} · ${plural(jobs, "job")}`} primary />
            <Kpi
              label={`vs ${prevShort}`}
              value={change === null ? "—" : `${change >= 0 ? "▲" : "▼"} ${Math.abs(Math.round(change * 100))}%`}
              sub={change === null ? `No revenue recorded in ${prevShort}` : changeSub}
              tone={change === null ? undefined : change >= 0 ? "up" : "down"}
            />
            <Kpi label="Return on ad spend" value={roas === null ? "—" : roasLabel(roas)} sub={roas === null ? "No ad spend yet" : `${money(roas, "USD")} back per $1 spent`} />
            <Kpi label="Ad spend" value={money(spend, "USD", true)} sub="Clients reporting revenue" />
            <Kpi
              label={`Clients at ${ROAS_TARGET}×+`}
              value={scored.length ? `${above.length} of ${scored.length}` : "—"}
              sub={targetSub}
              tone={below.length > 0 ? "down" : undefined}
            />
            <Kpi
              label="Best performer"
              value={best ? best.s.name : "—"}
              sub={best ? `${roasLabel(best.r)} ROAS · ${money(best.s.revenue, "USD", true)}` : "No revenue yet"}
              text
            />
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2>Revenue by month, all clients</h2>
              <span className="muted">6 months through {month.name}</span>
            </div>
            <MonthChart months={months} />
          </section>

          <section className="panel flush">
            <div className="panel-head padded">
              <h2>By client</h2>
              <span className="muted">{past ? month.label : "This month"}</span>
            </div>
            {table.length === 0 ? (
              <p className="muted pad">{past ? `No closed jobs recorded for ${month.label}.` : "No closed jobs recorded yet."}</p>
            ) : (
              <div className="table-wrap">
                <table className="rev-table">
                  <thead>
                    <tr>
                      <th>Client</th>
                      <th className="r">Ad spend</th>
                      <th className="r">Leads</th>
                      <th className="r">Jobs</th>
                      <th className="r">Close rate</th>
                      <th className="r">Revenue</th>
                      <th className="r">Avg job</th>
                      <th className="r">Cost / job</th>
                      <th className="r">ROAS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {table.map((s) => {
                      const r = s.spend > 0 ? s.revenue / s.spend : null;
                      return (
                        <tr key={s.key} style={tintOf(s.client)}>
                          <td className="client-cell">
                            <span className="row-avatar" aria-hidden="true">{initials(s.name)}</span>
                            <span className="cname">{s.name}</span>
                            {!s.client && (
                              <span className="obj warn">
                                {past ? `No matching Meta ad spend in ${month.name}` : "No matching Meta ad account"}
                              </span>
                            )}
                          </td>
                          <td className="r">{s.client ? money(s.spend, "USD") : "—"}</td>
                          <td className="r">{s.client ? int(s.leads) : "—"}</td>
                          <td className="r">{int(s.jobs)}</td>
                          <td className="r">{s.leads ? pct(s.jobs / s.leads) : "—"}</td>
                          <td className="r strong accent">{money(s.revenue, "USD")}</td>
                          <td className="r">{s.jobs ? money(s.revenue / s.jobs, "USD", true) : "—"}</td>
                          <td className="r">{s.jobs && s.spend ? money(s.spend / s.jobs, "USD") : "—"}</td>
                          <td className="r">
                            {r === null ? "—" : (
                              <span className={r >= ROAS_TARGET ? "pill" : "pill pill-low"} title={r >= ROAS_TARGET ? `At or above ${ROAS_TARGET}×` : `Below the ${ROAS_TARGET}× target`}>
                                {roasLabel(r)}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {untracked.length > 0 && !rev.error && (
              <p className="muted pad small">
                Not reporting revenue yet: {untracked.map((s) => s.name).join(", ")}. They&rsquo;re left out of the totals above.
              </p>
            )}
          </section>

          <section className="panel flush">
            <div className="panel-head padded">
              <h2>{past ? `Closed jobs in ${month.name}` : "Closed jobs this month"}</h2>
              <span className="muted">
                {jobsSorted.length > JOB_LIMIT
                  ? `Latest ${JOB_LIMIT} of ${int(jobsSorted.length)}`
                  : plural(jobsSorted.length, "job")}
              </span>
            </div>
            {recent.length === 0 ? (
              <p className="muted pad">
                {past
                  ? `No jobs were marked Won in ${month.label}.`
                  : "Nothing yet this month. Jobs appear here as soon as an opportunity is marked Won in GoHighLevel."}
              </p>
            ) : (
              <div className="table-wrap">
                <table className="jobs-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Client</th>
                      <th>Customer</th>
                      <th>Source</th>
                      <th className="r">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recent.map(({ row, name, client }) => (
                      <tr key={row.id || `${row.date}-${row.client}-${row.amount}`} style={tintOf(client)}>
                        <td>{formatDate(row.date)}</td>
                        <td><span className="dot-swatch inline" aria-hidden="true" />{name}</td>
                        <td>{row.customer || <span className="muted">—</span>}</td>
                        <td className="muted">{row.source || "—"}</td>
                        <td className="r strong">{money(row.amount, "USD")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      <footer>
        Revenue comes from opportunities marked Won in GoHighLevel. Ad spend and leads come from Meta for the same month. A job
        closed early in the month may come from a lead generated the month before, so close rate is a guide, not an exact match.
      </footer>
    </main>
  );
}

function formatDate(d: string) {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, m - 1, day).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

type KpiProps = {
  label: string;
  value: string;
  sub: string;
  primary?: boolean;
  /** "up"/"down" color the value; the ▲/▼ or wording carries the meaning too, so it never relies on color alone */
  tone?: "up" | "down";
  /** Value is a name rather than a number: smaller type that can wrap */
  text?: boolean;
};

function Kpi({ label, value, sub, primary, tone, text }: KpiProps) {
  const cls = ["kpi-value", tone ? `kpi-${tone}` : "", text ? "kpi-value-text" : ""].filter(Boolean).join(" ");
  return (
    <div className={`kpi${primary ? " kpi-primary" : ""}`}>
      <span className="kpi-label">{label}</span>
      <span className={cls} title={text ? value : undefined}>{value}</span>
      <span className="kpi-sub">{sub}</span>
    </div>
  );
}

type ChartMonth = { key: string; label: string; total: number; selected: boolean; partial: boolean };

/** Six months of revenue. The selected month is orange; click any bar to jump to that month. */
function MonthChart({ months }: { months: ChartMonth[] }) {
  const now = new Date();
  const thisKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const href = (key: string) => (key === thisKey ? "/revenue" : `/revenue?month=${key}`);
  const W = 960, H = 220, padL = 64, padB = 28, padT = 22;
  const max = Math.max(...months.map((m) => m.total), 1);
  const step = Math.pow(10, Math.floor(Math.log10(max)));
  const niceMax = Math.ceil(max / step) * step;
  const bw = (W - padL) / months.length;
  const y = (v: number) => padT + (H - padT - padB) * (1 - v / niceMax);
  const ticks = [0, 0.5, 1].map((t) => t * niceMax);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="Revenue by month">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={padL} x2={W} y1={y(t)} y2={y(t)} className="grid" />
          <text x={padL - 8} y={y(t) + 4} textAnchor="end" className="axis">{money(t, "USD", true)}</text>
        </g>
      ))}
      {months.map((m, i) => {
        const x = padL + i * bw + bw * 0.22;
        const w = bw * 0.56;
        const cls = ["bar", m.selected ? "" : "bar-dim", m.partial ? "bar-partial" : ""].filter(Boolean).join(" ");
        return (
          <a key={m.key} href={href(m.key)} className="chart-link">
            <rect x={x - bw * 0.2} y={padT} width={bw * 0.96} height={H - padT} fill="transparent" />
            <rect x={x} y={y(m.total)} width={w} height={Math.max(0, y(0) - y(m.total))} rx={3} className={cls}>
              <title>{`${m.label}: ${money(m.total, "USD")}${m.partial ? " (so far)" : ""}`}</title>
            </rect>
            {m.total > 0 && (
              <text x={x + w / 2} y={y(m.total) - 7} textAnchor="middle" className={m.selected ? "bar-label" : "bar-label bar-label-dim"}>
                {money(m.total, "USD", true)}
              </text>
            )}
            <text x={x + w / 2} y={H - 8} textAnchor="middle" className={m.selected ? "axis axis-today" : "axis"}>
              {m.label}{m.partial ? " (so far)" : ""}
            </text>
          </a>
        );
      })}
    </svg>
  );
}
