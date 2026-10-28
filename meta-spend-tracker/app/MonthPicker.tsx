"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";

type Option = { key: string; label: string };

type Props = {
  options: Option[]; // newest first; options[0] is the current month
  selected: string;
};

export default function MonthPicker({ options, selected }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  const idx = Math.max(0, options.findIndex((o) => o.key === selected));
  const href = (key: string) => (key === options[0].key ? pathname : `${pathname}?month=${key}`);
  const older = options[idx + 1];
  const newer = idx > 0 ? options[idx - 1] : undefined;

  return (
    <div className={`month-picker${pending ? " is-loading" : ""}`}>
      {older ? (
        <Link className="mp-arrow" href={href(older.key)} aria-label={`Previous month, ${older.label}`} title={older.label}>
          ‹
        </Link>
      ) : (
        <span className="mp-arrow mp-disabled" aria-hidden="true">‹</span>
      )}

      <label className="mp-select-wrap">
        <span className="sr-only">Month</span>
        <select
          className="mp-select"
          value={options[idx].key}
          onChange={(e) => startTransition(() => router.push(href(e.target.value)))}
        >
          {options.map((o, i) => (
            <option key={o.key} value={o.key}>
              {i === 0 ? `${o.label} (this month)` : o.label}
            </option>
          ))}
        </select>
      </label>

      {newer ? (
        <Link className="mp-arrow" href={href(newer.key)} aria-label={`Next month, ${newer.label}`} title={newer.label}>
          ›
        </Link>
      ) : (
        <span className="mp-arrow mp-disabled" aria-hidden="true">›</span>
      )}

      {idx > 0 && (
        <Link className="mp-today" href={pathname}>
          This month
        </Link>
      )}
    </div>
  );
}
