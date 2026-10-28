export const TZ = process.env.DASHBOARD_TIMEZONE || "America/Chicago";

export function money(n: number, currency = "USD", compact = false) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: compact ? 0 : 2,
    minimumFractionDigits: compact ? 0 : 2,
  }).format(n);
}

export const int = (n: number) => new Intl.NumberFormat("en-US").format(Math.round(n));

export const plural = (n: number, word: string) => `${int(n)} ${word}${Math.round(n) === 1 ? "" : "s"}`;

/** Today's date parts in the dashboard time zone. */
export function calendar() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const year = get("year"), month = get("month"), day = get("day");
  const daysInMonth = new Date(year, month, 0).getDate();
  const label = new Date(year, month - 1, 1).toLocaleString("en-US", { month: "long", year: "numeric" });
  const monthKey = `${year}-${String(month).padStart(2, "0")}`;
  return { year, month, day, daysInMonth, label, monthKey };
}

/** How far back the month picker goes. Meta keeps ad insights for 37 months. */
export const MONTHS_BACK = 36;

export type MonthSel = {
  year: number;
  month: number; // 1-12
  key: string; // YYYY-MM
  label: string; // "September 2026"
  name: string; // "September"
  isCurrent: boolean;
  since: string; // YYYY-MM-DD
  until: string; // YYYY-MM-DD
  daysInMonth: number;
  /** Day of the month the data runs through: today for the current month, the last day otherwise. */
  day: number;
};

const pad2 = (n: number) => String(n).padStart(2, "0");

function makeMonth(year: number, month: number, isCurrent: boolean, today: number): MonthSel {
  const daysInMonth = new Date(year, month, 0).getDate();
  const first = new Date(year, month - 1, 1);
  return {
    year,
    month,
    key: `${year}-${pad2(month)}`,
    label: first.toLocaleString("en-US", { month: "long", year: "numeric" }),
    name: first.toLocaleString("en-US", { month: "long" }),
    isCurrent,
    since: `${year}-${pad2(month)}-01`,
    until: `${year}-${pad2(month)}-${pad2(daysInMonth)}`,
    daysInMonth,
    day: isCurrent ? today : daysInMonth,
  };
}

/** Month list for the picker, newest first. */
export function monthOptions(): MonthSel[] {
  const cal = calendar();
  return Array.from({ length: MONTHS_BACK + 1 }, (_, i) => {
    const d = new Date(cal.year, cal.month - 1 - i, 1);
    return makeMonth(d.getFullYear(), d.getMonth() + 1, i === 0, cal.day);
  });
}

/** Reads ?month=YYYY-MM. Anything missing, malformed, in the future, or too old falls back to this month. */
export function parseMonth(param?: string | string[]): MonthSel {
  const value = Array.isArray(param) ? param[0] : param;
  const options = monthOptions();
  return options.find((m) => m.key === value) || options[0];
}

export function updatedLabel(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: TZ, month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}
