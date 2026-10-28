import { NextResponse, type NextRequest } from "next/server";

/**
 * Password protection for the whole site. Your client spend should not be
 * public, so once a Meta token is configured the dashboard refuses to load
 * until DASHBOARD_PASSWORD is set too. Any username works; only the password
 * is checked.
 */
export function middleware(req: NextRequest) {
  const password = process.env.DASHBOARD_PASSWORD;

  if (!password) {
    if (process.env.META_ACCESS_TOKEN) {
      return new NextResponse(
        "DASHBOARD_PASSWORD is not set. Add it in your Vercel project's environment variables and redeploy.",
        { status: 503 }
      );
    }
    return NextResponse.next(); // demo mode, nothing sensitive to protect
  }

  const header = req.headers.get("authorization") || "";
  if (header.startsWith("Basic ")) {
    try {
      const decoded = atob(header.slice(6));
      const supplied = decoded.slice(decoded.indexOf(":") + 1);
      if (supplied === password) return NextResponse.next();
    } catch {
      // fall through to the challenge
    }
  }

  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Meta Spend Tracker", charset="UTF-8"' },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
