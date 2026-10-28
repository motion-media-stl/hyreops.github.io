import { revalidatePath, revalidateTag } from "next/cache";
import { NextResponse } from "next/server";

/** Clears the cached Meta numbers so the next page load pulls fresh data. */
export async function POST() {
  revalidateTag("meta");
  revalidatePath("/");
  revalidatePath("/revenue");
  return NextResponse.json({ ok: true, refreshedAt: new Date().toISOString() });
}
