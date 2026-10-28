import { getTrackerData } from "@/lib/meta";
import type { Client } from "@/lib/types";
import RefreshButton from "./RefreshButton";

// Re-pull from Meta at most once an hour; "Refresh now" forces it sooner.
export const revalidate = 3600;

const TZ = process.env.DASHBOARD_TIMEZONE || "America/Chicago";

function money(n: number, currency = "USD", compact = false) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: compact ? 0 : 2,
    minimumFractionDigits: compact ? 0 : 2,
  }).format(n);
}
const int = (n: number) => new Intl.NumberFormat("en-US").format(Math.round(n));

function calendar() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const year = get("year"), month = get("month"), day = get("day");
  const daysInMonth = new Date(year, month, 0).getDate();
  const label = new Date(year, month - 1, 1).toLocaleString("en-US", { month: "long", year: "numeric" });
  return { year, month, day, daysInMonth, label };
}

export default async function Page() {
  const data = await getTrackerData();
  const cal = calendar();

  // Totals only add up clients in the main currency, so mixed-currency accounts don't distort them.
  const currencyCounts = new Map<string, number>();
  data.clients.forEach((c) => currencyCounts.set(c.currency, (currencyCounts.get(c.currency) || 0) + 1));
  const currency = [...currencyCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "USD";
  const counted = data.clients.filter((c) => c.currency === currency && !c.error);
  const otherCurrency = data.clients.filter((c) => c.currency !== currency);

  const sum = (f: (c: Client) => number) => counted.reduce((s, c) => s + f(c), 0);
  const mtd = sum((c) => c.spendMTD);
  const today = sum((c) => c.spendToday);
  const yesterday = sum((c) => c.spendYesterday);
  const leads = sum((c) => c.leadsMTD);
  const leadsYesterday = sum((c) => c.leadsYesterday);
  const leadSpend = sum((c) => c.leadSpendMTD);
  const activeCampaigns = data.clients.reduce((s, c) => s + c.campaigns.length, 0);
  const activeClients = data.clients.filter((c) => c.campaigns.length > 0).length;

  // Month-end projection: average of completed days, carried through the rest of the month.
  const completeDays = cal.day - 1;
  const throughYesterday = mtd - today;
  const projected = completeDays > 0
    ? throughYesterday + (throughYesterday / completeDays) * (cal.daysInMonth - completeDays)
    : null;

  // Daily totals for the chart.
  const dailyTotals = Array.from({ length: cal.daysInMonth }, () => 0);
  for (const c of counted) {
    for (const d of c.daily) {
      const dayNum = Number(d.date.slice(8, 10));
      if (dayNum >= 1 && dayNum <= cal.daysInMonth) dailyTotals[dayNum - 1] += d.spend;
    }
  }

  const updated = new Date(data.fetchedAt).toLocaleString("en-US", {
    timeZone: TZ, month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });

  return (
    <main>
      <header className="top">
        <div>
          <p className="eyebrow">Motion Media · Meta Ads · {cal.label}</p>
          <h1>Client spend tracker<span className="dot">.</span></h1>
        </div>
        <div className="top-right">
          <span className="updated">Updated {updated}</span>
          <RefreshButton />
        </div>
      </header>

      {data.error && (
        <div className="notice notice-error">
          Couldn&rsquo;t reach Meta: {data.error}. Check that <code>META_ACCESS_TOKEN</code> is correct and hasn&rsquo;t been revoked.
        </div>
      )}

      {data.demo && (
        <div className="notice">
          Showing sample data. Add your <code>META_ACCESS_TOKEN</code> to pull your real accounts.
        </div>
      )}

      <section className="kpis">
        <Kpi label="Spent this month" value={money(mtd, currency)} sub={`Across ${counted.length} client${counted.length === 1 ? "" : "s"}`} primary />
        <Kpi label="Projected total" value={projected === null ? "n/a" : money(projected, currency, true)} sub={projected === null ? "Available from day 2" : "By month end, at current pace"} />
        <Kpi label="Yesterday" value={money(yesterday, currency)} sub={`Full day · ${int(leadsYesterday)} lead${leadsYesterday === 1 ? "" : "s"}`} />
        <Kpi label="Today so far" value={money(today, currency)} sub="Partial, still delivering" />
        <Kpi label="Leads this month" value={int(leads)} sub={`${int(leadsYesterday)} yesterday`} />
        <Kpi label="Cost per lead" value={leads ? money(leadSpend / leads, currency) : "—"} sub="Lead campaigns only" />
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Daily spend, all clients</h2>
          <span className="muted">{currency}</span>
        </div>
        <DailyChart totals={dailyTotals} today={cal.day} currency={currency} />
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Spend by client</h2>
          <span className="muted">Month to date</span>
        </div>
        <div className="share">
          {counted.map((c) => (
            <div className="share-row" key={c.accountId}>
              <span className="share-name">{c.name}</span>
              <span className="share-bar"><span style={{ width: `${mtd ? (c.spendMTD / mtd) * 100 : 0}%` }} /></span>
              <span className="share-val">{money(c.spendMTD, c.currency)}</span>
              <span className="share-pct">{mtd ? Math.round((c.spendMTD / mtd) * 100) : 0}%</span>
            </div>
          ))}
        </div>
      </section>

      {otherCurrency.length > 0 && (
        <div className="notice">
          {otherCurrency.map((c) => c.name).join(", ")} bill in a different currency, so they are listed below but left out of the totals above.
        </div>
      )}

      <h2 className="section-title">
        Active campaigns by client
        <span className="muted section-count">{int(activeCampaigns)} running across {activeClients} client{activeClients === 1 ? "" : "s"}</span>
      </h2>
      {data.clients.map((c) => <ClientBlock key={c.accountId} client={c} />)}

      <footer>Numbers come straight from Meta and follow each ad account&rsquo;s own time zone. Meta can revise the last day or two of spend slightly as it finalizes billing.</footer>
    </main>
  );
}

function Kpi({ label, value, sub, primary }: { label: string; value: string; sub: string; primary?: boolean }) {
  return (
    <div className={`kpi${primary ? " kpi-primary" : ""}`}>
      <span className="kpi-label">{label}</span>
      <span className="kpi-value">{value}</span>
      <span className="kpi-sub">{sub}</span>
    </div>
  );
}

function DailyChart({ totals, today, currency }: { totals: number[]; today: number; currency: string }) {
  const W = 960, H = 220, padL = 56, padB = 26, padT = 12;
  const max = Math.max(...totals, 1);
  const step = Math.pow(10, Math.floor(Math.log10(max)));
  const niceMax = Math.ceil(max / step) * step;
  const bw = (W - padL) / totals.length;
  const y = (v: number) => padT + (H - padT - padB) * (1 - v / niceMax);
  const ticks = [0, 0.5, 1].map((t) => t * niceMax);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="Daily spend this month">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={padL} x2={W} y1={y(t)} y2={y(t)} className="grid" />
          <text x={padL - 8} y={y(t) + 4} textAnchor="end" className="axis">{money(t, currency, true)}</text>
        </g>
      ))}
      {totals.map((v, i) => {
        const day = i + 1;
        const future = day > today;
        const x = padL + i * bw + bw * 0.18;
        const h = Math.max(0, y(0) - y(v));
        return (
          <g key={i}>
            {!future && (
              <rect x={x} y={y(v)} width={bw * 0.64} height={h} rx={2}
                className={day === today ? "bar bar-today" : "bar"}>
                <title>{`Day ${day}: ${money(v, currency)}${day === today ? " (so far)" : ""}`}</title>
              </rect>
            )}
            {(day === 1 || day % 5 === 0 || day === today) && (
              <text x={x + bw * 0.32} y={H - 8} textAnchor="middle" className={day === today ? "axis axis-today" : "axis"}>{day}</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function ClientBlock({ client: c }: { client: Client }) {
  const activeMTD = c.campaigns.reduce((s, x) => s + x.spendMTD, 0);
  const inactive = c.spendMTD - activeMTD;

  return (
    <details className="client" open>
      <summary>
        <div className="client-name">
          <strong>{c.name}</strong>
          <span className="muted">{c.campaigns.length} active · {c.accountId.replace("act_", "")}</span>
        </div>
        <div className="client-figs">
          <Fig label="Today" value={money(c.spendToday, c.currency)} />
          <Fig label="Yesterday" value={money(c.spendYesterday, c.currency)} />
          <Fig label="Leads" value={int(c.leadsMTD)} />
          <Fig label="Cost per lead" value={c.leadsMTD ? money(c.leadSpendMTD / c.leadsMTD, c.currency) : "—"} />
          <Fig label="Month to date" value={money(c.spendMTD, c.currency)} strong />
        </div>
      </summary>

      {c.error ? (
        <p className="error">Couldn&rsquo;t load this account: {c.error}</p>
      ) : c.campaigns.length === 0 ? (
        <p className="muted pad">No active campaigns right now.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Campaign</th>
                <th className="r">Budget</th>
                <th className="r">Today</th>
                <th className="r">Yesterday</th>
                <th className="r">Month to date</th>
                <th className="r">Leads</th>
                <th className="r">CPL</th>
                <th className="r">Clicks</th>
                <th className="r">CTR</th>
                <th className="r">CPC</th>
              </tr>
            </thead>
            <tbody>
              {c.campaigns.map((x) => (
                <tr key={x.id}>
                  <td>
                    <span className="cname">{x.name}</span>
                    <span className="obj">{x.objective.replace("OUTCOME_", "").toLowerCase()}</span>
                  </td>
                  <td className="r">
                    {x.dailyBudget ? `${money(x.dailyBudget, c.currency)}/day` : x.lifetimeBudget ? `${money(x.lifetimeBudget, c.currency, true)} lifetime` : "—"}
                  </td>
                  <td className="r">{money(x.spendToday, c.currency)}</td>
                  <td className="r">{money(x.spendYesterday, c.currency)}</td>
                  <td className="r strong">{money(x.spendMTD, c.currency)}</td>
                  <td className="r">
                    {x.leadsMTD || x.leadsYesterday ? (
                      <>
                        <span className="strong">{int(x.leadsMTD)}</span>
                        <span className="sub">{int(x.leadsYesterday)} yesterday</span>
                      </>
                    ) : "—"}
                  </td>
                  <td className="r">{x.leadsMTD ? money(x.spendMTD / x.leadsMTD, c.currency) : "—"}</td>
                  <td className="r">{int(x.clicks)}</td>
                  <td className="r">{x.impressions ? `${((x.clicks / x.impressions) * 100).toFixed(2)}%` : "—"}</td>
                  <td className="r">{x.clicks ? money(x.spendMTD / x.clicks, c.currency) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!c.error && inactive > 0.5 && (
        <p className="muted pad small">
          Month to date includes {money(inactive, c.currency)} from campaigns that have since been paused or ended.
        </p>
      )}
    </details>
  );
}

function Fig({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`fig${strong ? " fig-strong" : ""}`}>
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}
