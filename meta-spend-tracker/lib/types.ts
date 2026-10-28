export type Campaign = {
  id: string;
  name: string;
  objective: string;
  /** Daily or lifetime budget in account currency (major units), if set at campaign level */
  dailyBudget: number | null;
  lifetimeBudget: number | null;
  spendToday: number;
  spendYesterday: number;
  spendMTD: number;
  impressions: number;
  clicks: number;
  leadsYesterday: number;
  leadsMTD: number;
};

export type DailyPoint = { date: string; spend: number };

export type Client = {
  accountId: string;
  name: string;
  currency: string;
  timezone: string;
  /** Active campaigns only */
  campaigns: Campaign[];
  /** Account-level totals, including campaigns paused or ended earlier this month */
  spendToday: number;
  spendYesterday: number;
  spendMTD: number;
  leadsYesterday: number;
  leadsMTD: number;
  /** Spend from campaigns that produced leads this month, so cost per lead isn't inflated by awareness or sales campaigns */
  leadSpendMTD: number;
  daily: DailyPoint[];
  error?: string;
};

export type TrackerData = {
  clients: Client[];
  fetchedAt: string;
  demo: boolean;
  /** Set when Meta couldn't be reached at all, e.g. an invalid or revoked token */
  error?: string;
};
