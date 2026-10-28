import type { Client, TrackerData } from "./types";

/** Sample data shown until META_ACCESS_TOKEN is set, so the layout can be previewed. */
export function demoData(): TrackerData {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const today = now.getDate();
  const pad = (n: number) => String(n).padStart(2, "0");

  // Simple deterministic pseudo-random so the demo looks the same on every load.
  let seed = 7;
  const rand = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };

  const make = (
    name: string,
    id: string,
    campaigns: [string, string, number][]
  ): Client => {
    const daily = Array.from({ length: today }, (_, i) => {
      const base = campaigns.reduce((s, c) => s + c[2], 0);
      return { date: `${y}-${pad(m + 1)}-${pad(i + 1)}`, spend: Math.round(base * (0.8 + rand() * 0.35) * 100) / 100 };
    });
    daily[today - 1].spend = Math.round(daily[today - 1].spend * 0.55 * 100) / 100;
    const mtd = daily.reduce((s, d) => s + d.spend, 0);
    const totalBudget = campaigns.reduce((s, c) => s + c[2], 0);

    const cs = campaigns.map(([cname, objective, budget], i) => {
      const share = budget / totalBudget;
      const spendMTD = Math.round(mtd * share * 100) / 100;
      const impressions = Math.round(spendMTD * (60 + rand() * 50));
      const isLeads = objective === "OUTCOME_LEADS";
      const cpl = 18 + rand() * 27;
      const spendYesterday = today > 1 ? Math.round(daily[today - 2].spend * share * 100) / 100 : 0;
      return {
        id: `${id}${i}`,
        name: cname,
        objective,
        dailyBudget: budget,
        lifetimeBudget: null,
        spendToday: Math.round(daily[today - 1].spend * share * 100) / 100,
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
      spendToday: daily[today - 1].spend,
      spendYesterday: today > 1 ? daily[today - 2].spend : 0,
      spendMTD: Math.round(mtd * 100) / 100,
      leadsYesterday: cs.reduce((s, c) => s + c.leadsYesterday, 0),
      leadsMTD: cs.reduce((s, c) => s + c.leadsMTD, 0),
      leadSpendMTD: cs.reduce((s, c) => s + (c.leadsMTD > 0 ? c.spendMTD : 0), 0),
      daily,
    };
  };

  const clients = [
    make("Gateway Home Services", "1001", [
      ["Fall Furnace Tune-Up | Leads", "OUTCOME_LEADS", 85],
      ["Retargeting | Site Visitors 30d", "OUTCOME_SALES", 25],
    ]),
    make("Lindell Dental Group", "1002", [
      ["New Patient Special | Leads", "OUTCOME_LEADS", 60],
      ["Invisalign Consults", "OUTCOME_LEADS", 40],
    ]),
    make("Riverside Fitness", "1003", [
      ["7-Day Free Pass", "OUTCOME_LEADS", 45],
    ]),
    make("Motion Media", "1004", [
      ["Agency Brand Awareness", "OUTCOME_AWARENESS", 15],
    ]),
  ].sort((a, b) => b.spendMTD - a.spendMTD);

  return { clients, fetchedAt: now.toISOString(), demo: true };
}
