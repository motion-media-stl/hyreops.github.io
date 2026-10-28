/**
 * Client card color. Every client uses the Motion Media brand orange; clients are told apart
 * by name, initials badge, and their own outlined card.
 *
 * To give each client its own color instead, swap in this palette, which was checked against
 * the dark background for contrast and color-blind separation:
 *   ["#00a3b8", "#9085e9", "#c98500", "#d55181", "#008300"]
 * and restore the tinted header and left stripe in globals.css (see the note on .client).
 */
export const CLIENT_COLORS = ["#F56600"];

/** Color used for revenue that doesn't match any Meta ad account. */
export const UNMATCHED_COLOR = "#6b6b6b";

export const clientColor = (index: number | undefined) =>
  index === undefined || index < 0 ? UNMATCHED_COLOR : CLIENT_COLORS[index % CLIENT_COLORS.length];

/** "Gateway Home Services" → "GH", "Riverside Fitness LLC" → "RF". */
export function initials(name: string) {
  const words = name
    .replace(/\b(llc|inc|co|corp|the|group|company)\b\.?/gi, "")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
  if (words.length === 0) return name.slice(0, 2).toUpperCase();
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/**
 * Gives each ad account a fixed color slot, ordered by account ID. Meta issues IDs in
 * increasing order, so a newly added client lands at the end and existing clients keep
 * their colors. Assigned from the full account list, before any month filtering, so a
 * client looks the same in every month.
 */
export function assignColors<T extends { accountId: string; colorIndex?: number }>(items: T[]) {
  const ids = [...new Set(items.map((c) => c.accountId))].sort((a, b) => {
    const na = BigInt(a.replace(/\D/g, "") || "0");
    const nb = BigInt(b.replace(/\D/g, "") || "0");
    return na < nb ? -1 : na > nb ? 1 : 0;
  });
  const slot = new Map(ids.map((id, i) => [id, i]));
  for (const c of items) c.colorIndex = slot.get(c.accountId);
  return items;
}
