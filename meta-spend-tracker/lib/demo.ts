import type { Client, TrackerData } from "./types";
import type { MonthSel } from "./format";
import { assignColors } from "./colors";

/**
 * Sample data shown until META_ACCESS_TOKEN is set, so the layout can be previewed.
 * Each month is generated from its own seed, so flipping between months looks
 * realistic and the same month always shows the same numbers.
 */
export function demoData(month: MonthSel): TrackerData {
  const pad = (n: number) => String(n).padStart(2, "0");
  const now = new Date();
  const monthsBack = (now.getFullYear() - month.year) * 12 + (now.getMonth() + 1 - month.month);
  const days = month.day; // through today for this month, the full month otherwise

  let seed = 7 + month.year * 13 + month.month * 101;
  const rand = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };

  // Accounts grew over time: earlier months ran at lower budgets.
  const growth = Math.max(0.45, 1 - monthsBack * 0.06);

  const make = (
    name: string,
    id: string,
    campaigns: [string, string, number][],
    startedMonthsAgo = 99
  ): Client | null => {
    if (monthsBack > startedMonthsAgo) return null;
    const scaled = campaigns.map(([n, o, b]) => [n, o, Math.round(b * growth)] as [string, string, number]);
    const total = scaled.reduce((s, c) => s + c[2], 0);
    const daily = Array.from({ length: days }, (_, i) => ({
      date: `${month.year}-${pad(month.month)}-${pad(i + 1)}`,
      spend: Math.round(total * (0.8 + rand() * 0.35) * 100) / 100,
    }));
    if (month.isCurrent) daily[days - 1].spend = Math.round(daily[days - 1].spend * 0.55 * 100) / 100;
    const mtd = daily.reduce((s, d) => s + d.spend, 0);
    const lastFull = month.isCurrent && days > 1 ? daily[days - 2].spend : 0;
    const todaySpend = month.isCurrent ? daily[days - 1].spend : 0;

    const cs = scaled.map(([cname, objective, budget], i) => {
      const share = budget / total;
      const spendMTD = Math.round(mtd * share * 100) / 100;
      const impressions = Math.round(spendMTD * (60 + rand() * 50));
      const isLeads = objective === "OUTCOME_LEADS";
      const cpl = 18 + rand() * 27;
      const spendYesterday = Math.round(lastFull * share * 100) / 100;
      return {
        id: `${id}${i}`,
        name: cname,
        objective,
        dailyBudget: month.isCurrent ? budget : null,
        lifetimeBudget: null,
        spendToday: Math.round(todaySpend * share * 100) / 100,
        spendYesterday,
        spendMTD,
        impressions,
        clicks: Math.round(impressions * (0.008 + rand() * 0.012)),
        leadsYesterday: isLeads ? Math.round(spendYesterday / cpl) : 0,
        leadsMTD: isLeads ? Math.round(spendMTD / cpl) : 0,
      };
    });

    return {
      accountId: `act_${id}`,
      name,
      currency: "USD",
      timezone: "America/Chicago",
      campaigns: cs,
      spendToday: todaySpend,
      spendYesterday: lastFull,
      spendMTD: Math.round(mtd * 100) / 100,
      leadsYesterday: cs.reduce((s, c) => s + c.leadsYesterday, 0),
      leadsMTD: cs.reduce((s, c) => s + c.leadsMTD, 0),
      leadSpendMTD: cs.reduce((s, c) => s + (c.leadsMTD > 0 ? c.spendMTD : 0), 0),
      daily,
    };
  };

  // Seasonal campaign names so past months don't look copy-pasted.
  const hvac = [6, 7, 8].includes(month.month)
    ? "Summer AC Tune-Up | Leads"
    : [12, 1, 2].includes(month.month)
      ? "Winter Heating Check | Leads"
      : month.month >= 9 && month.month <= 11
        ? "Fall Furnace Tune-Up | Leads"
        : "Spring System Check | Leads";

  const all = [
    make("Gateway Home Services", "1001", [
      [hvac, "OUTCOME_LEADS", 85],
      ["Retargeting | Site Visitors 30d", "OUTCOME_SALES", 25],
    ]),
    make("Lindell Dental Group", "1002", [
      ["New Patient Special | Leads", "OUTCOME_LEADS", 60],
      ["Invisalign Consults", "OUTCOME_LEADS", 40],
    ]),
    make("Riverside Fitness", "1003", [["7-Day Free Pass", "OUTCOME_LEADS", 45]], 8),
    make("Motion Media", "1004", [["Agency Brand Awareness", "OUTCOME_AWARENESS", 15]]),
  ];
  // Colors are assigned across every sample client, so a client keeps its color in months it didn't run.
  const colorOf = new Map(
    assignColors(["1001", "1002", "1003", "1004"].map((id) => ({ accountId: `act_${id}`, colorIndex: 0 })))
      .map((c) => [c.accountId, c.colorIndex])
  );
  const clients = all
    .filter((c): c is Client => c !== null)
    .map((c) => ({ ...c, colorIndex: colorOf.get(c.accountId) }))
    .sort((a, b) => b.spendMTD - a.spendMTD);

  return { clients, fetchedAt: now.toISOString(), demo: true };
}
