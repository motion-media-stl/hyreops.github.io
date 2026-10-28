import { getTrackerData } from "@/lib/meta";
import type { Client } from "@/lib/types";
import { int, money, parseMonth, plural, updatedLabel, type MonthSel } from "@/lib/format";
import Header from "./Header";

// Meta responses are cached for an hour (a day for finished months); "Refresh now" forces fresh numbers.
export const dynamic = "force-dynamic";

type PageProps = { searchParams: Promise<{ month?: string | string[] }> };

export default async function Page({ searchParams }: PageProps) {
  const month = parseMonth((await searchParams).month);
  const data = await getTrackerData(month);
  const past = !month.isCurrent;

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
  const campaignCount = data.clients.reduce((s, c) => s + c.campaigns.length, 0);
  const clientsWithCampaigns = data.clients.filter((c) => c.campaigns.length > 0).length;

  // Month-end projection: average of completed days, carried through the rest of the month.
  const completeDays = month.day - 1;
  const throughYesterday = mtd - today;
  const projected = completeDays > 0
    ? throughYesterday + (throughYesterday / completeDays) * (month.daysInMonth - completeDays)
    : null;

  // Daily totals for the chart.
  const dailyTotals = Array.from({ length: month.daysInMonth }, () => 0);
  for (const c of counted) {
    for (const d of c.daily) {
      const dayNum = Number(d.date.slice(8, 10));
      if (d.date.startsWith(month.key) && dayNum >= 1 && dayNum <= month.daysInMonth) dailyTotals[dayNum - 1] += d.spend;
    }
  }
  const bestIdx = dailyTotals.reduce((best, v, i) => (v > dailyTotals[best] ? i : best), 0);

  return (
    <main>
      <Header
        active="spend"
        eyebrow={`Motion Media · Meta Ads · ${month.label}`}
        title="Client spend tracker"
        updated={updatedLabel(data.fetchedAt)}
        month={month}
      />

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

      {past && (
        <div className="past-note">
          Viewing <b>{month.label}</b>, the full month as it ended. Campaigns are everything that ran that month, including ones that are off now.
        </div>
      )}

      {past ? (
        <section className="kpis">
          <Kpi label={`Spent in ${month.name}`} value={money(mtd, currency)} sub={`Across ${plural(counted.length, "client")}`} primary />
          <Kpi label="Daily average" value={money(mtd / month.daysInMonth, currency)} sub={`Over ${month.daysInMonth} days`} />
          <Kpi label="Biggest day" value={money(dailyTotals[bestIdx] || 0, currency)} sub={dailyTotals[bestIdx] ? `${month.name.slice(0, 3)} ${bestIdx + 1}` : "No spend"} />
          <Kpi label="Leads" value={int(leads)} sub={`${(leads / month.daysInMonth).toFixed(1)} per day`} />
          <Kpi label="Cost per lead" value={leads ? money(leadSpend / leads, currency) : "—"} sub="Lead campaigns only" />
          <Kpi label="Campaigns run" value={int(campaignCount)} sub={`Across ${plural(clientsWithCampaigns, "client")}`} />
        </section>
      ) : (
        <section className="kpis">
          <Kpi label="Spent this month" value={money(mtd, currency)} sub={`Across ${plural(counted.length, "client")}`} primary />
          <Kpi label="Projected total" value={projected === null ? "n/a" : money(projected, currency, true)} sub={projected === null ? "Available from day 2" : "By month end, at current pace"} />
          <Kpi label="Yesterday" value={money(yesterday, currency)} sub={`Full day · ${plural(leadsYesterday, "lead")}`} />
          <Kpi label="Today so far" value={money(today, currency)} sub="Partial, still delivering" />
          <Kpi label="Leads this month" value={int(leads)} sub={`${int(leadsYesterday)} yesterday`} />
          <Kpi label="Cost per lead" value={leads ? money(leadSpend / leads, currency) : "—"} sub="Lead campaigns only" />
        </section>
      )}

      <section className="panel">
        <div className="panel-head">
          <h2>Daily spend, all clients</h2>
          <span className="muted">{month.label} · {currency}</span>
        </div>
        <DailyChart totals={dailyTotals} month={month} currency={currency} />
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Spend by client</h2>
          <span className="muted">{past ? `All of ${month.name}` : "Month to date"}</span>
        </div>
        {counted.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>No ad spend recorded for {month.label}.</p>
        ) : (
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
        )}
      </section>

      {otherCurrency.length > 0 && (
        <div className="notice">
          {otherCurrency.map((c) => c.name).join(", ")} bill in a different currency, so they are listed below but left out of the totals above.
        </div>
      )}

      <h2 className="section-title">
        {past ? `Campaigns by client, ${month.name}` : "Active campaigns by client"}
        <span className="muted section-count">
          {past
            ? `${plural(campaignCount, "campaign")} ran across ${plural(clientsWithCampaigns, "client")}`
            : `${int(campaignCount)} running across ${plural(clientsWithCampaigns, "client")}`}
        </span>
      </h2>
      {data.clients.map((c) => <ClientBlock key={c.accountId} client={c} month={month} />)}

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

function DailyChart({ totals, month, currency }: { totals: number[]; month: MonthSel; currency: string }) {
  const W = 960, H = 220, padL = 56, padB = 26, padT = 12;
  const max = Math.max(...totals, 1);
  const step = Math.pow(10, Math.floor(Math.log10(max)));
  const niceMax = Math.ceil(max / step) * step;
  const bw = (W - padL) / totals.length;
  const y = (v: number) => padT + (H - padT - padB) * (1 - v / niceMax);
  const ticks = [0, 0.5, 1].map((t) => t * niceMax);
  const partialDay = month.isCurrent ? month.day : -1;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label={`Daily spend, ${month.label}`}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={padL} x2={W} y1={y(t)} y2={y(t)} className="grid" />
          <text x={padL - 8} y={y(t) + 4} textAnchor="end" className="axis">{money(t, currency, true)}</text>
        </g>
      ))}
      {totals.map((v, i) => {
        const day = i + 1;
        const future = day > month.day;
        const x = padL + i * bw + bw * 0.18;
        const h = Math.max(0, y(0) - y(v));
        return (
          <g key={i}>
            {!future && (
              <rect x={x} y={y(v)} width={bw * 0.64} height={h} rx={2}
                className={day === partialDay ? "bar bar-today" : "bar"}>
                <title>{`${month.name.slice(0, 3)} ${day}: ${money(v, currency)}${day === partialDay ? " (so far)" : ""}`}</title>
              </rect>
            )}
            {(day === 1 || day % 5 === 0 || day === partialDay ||
              // Label the last day of a finished month unless it would crowd the label just before it.
              (!month.isCurrent && day === month.daysInMonth && month.daysInMonth % 5 >= 3)) && (
              <text x={x + bw * 0.32} y={H - 8} textAnchor="middle" className={day === partialDay ? "axis axis-today" : "axis"}>{day}</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function ClientBlock({ client: c, month }: { client: Client; month: MonthSel }) {
  const past = !month.isCurrent;
  const listedSpend = c.campaigns.reduce((s, x) => s + x.spendMTD, 0);
  const inactive = c.spendMTD - listedSpend;
  const cpl = c.leadsMTD ? money(c.leadSpendMTD / c.leadsMTD, c.currency) : "—";

  return (
    <details className="client" open>
      <summary>
        <div className="client-name">
          <strong>{c.name}</strong>
          <span className="muted">
            {past ? plural(c.campaigns.length, "campaign") : `${c.campaigns.length} active`} · {c.accountId.replace("act_", "")}
          </span>
        </div>
        <div className="client-figs">
          {!past && <Fig label="Today" value={money(c.spendToday, c.currency)} />}
          {!past && <Fig label="Yesterday" value={money(c.spendYesterday, c.currency)} />}
          <Fig label="Leads" value={int(c.leadsMTD)} />
          <Fig label="Cost per lead" value={cpl} />
          {past && <Fig label="Daily avg" value={money(c.spendMTD / month.daysInMonth, c.currency)} />}
          <Fig label={past ? `${month.name} total` : "Month to date"} value={money(c.spendMTD, c.currency)} strong />
        </div>
      </summary>

      {c.error ? (
        <p className="error">Couldn&rsquo;t load this account: {c.error}</p>
      ) : c.campaigns.length === 0 ? (
        <p className="muted pad">{past ? `No campaigns ran in ${month.name}.` : "No active campaigns right now."}</p>
      ) : past ? (
        <div className="table-wrap">
          <table className="past-table">
            <thead>
              <tr>
                <th>Campaign</th>
                <th className="r">Spend</th>
                <th className="r">Share</th>
                <th className="r">Leads</th>
                <th className="r">CPL</th>
                <th className="r">Impr.</th>
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
                  <td className="r strong">{money(x.spendMTD, c.currency)}</td>
                  <td className="r muted">{c.spendMTD ? `${Math.round((x.spendMTD / c.spendMTD) * 100)}%` : "—"}</td>
                  <td className="r">{x.leadsMTD ? <span className="strong">{int(x.leadsMTD)}</span> : "—"}</td>
                  <td className="r">{x.leadsMTD ? money(x.spendMTD / x.leadsMTD, c.currency) : "—"}</td>
                  <td className="r">{int(x.impressions)}</td>
                  <td className="r">{int(x.clicks)}</td>
                  <td className="r">{x.impressions ? `${((x.clicks / x.impressions) * 100).toFixed(2)}%` : "—"}</td>
                  <td className="r">{x.clicks ? money(x.spendMTD / x.clicks, c.currency) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
                    {x.dailyBudget ? `${money(x.dailyBudget, c.currency, true)}/day` : x.lifetimeBudget ? `${money(x.lifetimeBudget, c.currency, true)} lifetime` : "—"}
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
      {!c.error && !past && inactive > 0.5 && (
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
