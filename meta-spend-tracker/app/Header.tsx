import Link from "next/link";
import { monthOptions, type MonthSel } from "@/lib/format";
import MonthPicker from "./MonthPicker";
import RefreshButton from "./RefreshButton";

type Props = {
  active: "spend" | "revenue";
  title: string;
  eyebrow: string;
  updated: string;
  month: MonthSel;
};

export default function Header({ active, title, eyebrow, updated, month }: Props) {
  const q = month.isCurrent ? "" : `?month=${month.key}`;
  const options = monthOptions().map((m) => ({ key: m.key, label: m.label }));

  return (
    <>
      <header className="top">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h1>{title}<span className="dot">.</span></h1>
        </div>
        <div className="top-right">
          <span className="updated">Updated {updated}</span>
          <RefreshButton />
        </div>
      </header>
      <div className="tabbar">
        <nav className="tabs" aria-label="Dashboard sections">
          <Link href={`/${q}`} className={active === "spend" ? "tab tab-active" : "tab"}>Spend &amp; leads</Link>
          <Link href={`/revenue${q}`} className={active === "revenue" ? "tab tab-active" : "tab"}>Revenue</Link>
        </nav>
        <MonthPicker options={options} selected={month.key} />
      </div>
    </>
  );
}
