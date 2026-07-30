import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type CookieToSet = {
  name: string;
  value: string;
  options: CookieOptions;
};

// Redirect helper that carries the (possibly refreshed/rotated) Supabase
// auth cookies from the working `response` onto the redirect. Without this,
// a token rotation during getUser() is lost on any middleware redirect,
// invalidating the session on the next request — the classic "first login
// bounces back to /login, second works" bug.
function redirectWithCookies(
  path: string,
  request: NextRequest,
  response: NextResponse,
): NextResponse {
  const redirect = NextResponse.redirect(new URL(path, request.url));
  response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
  return redirect;
}

// Auth gate + first-time onboarding redirect.
//
// 1. Public paths (/login, /auth/callback, PWA assets) are open.
// 2. Signed-out users hit /login.
// 3. Signed-in users with NO voice profile AND NO leads get redirected to
//    /welcome on their first visit to a "main app" page (/command-center, /inbox,
//    /decisions, /voice, /settings, /). Once they finish onboarding (or
//    skip with the explicit Skip button), they land on /command-center and the
//    redirect stops firing because hasProfile or hasLeads will be true.
//
// /welcome is protected but does not participate in the activation gate.
// That lets signed-in coaches revisit onboarding via ?force=1 without
// making the onboarding page available to anonymous visitors.

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;

  // Admin gate — hardcoded to Sunny's email. No config, no env var, no DB lookup.
  const ADMIN_EMAIL = "sunny.binjola@gmail.com";
  if (path.startsWith("/admin")) {
    if (!user || user.email !== ADMIN_EMAIL) {
      return redirectWithCookies("/login", request, response);
    }
    return response;
  }

  const publicPaths = [
    "/login",
    "/auth/callback",
    "/manifest.webmanifest",
    "/sw.js",
    // Brand OS $7 trip-wire flow — token-based access, no Supabase auth.
    // The token in the URL is the credential; routes verify it themselves.
    "/trial/",                  // /trial/[token]/... — all standalone Brand OS surfaces
    "/brand-os/trial/welcome",  // Stripe success redirect handler
    "/brand-os/trial/check-email", // Fallback page when auto-login fails
    "/brand-os/trial/expired",  // Bad/expired token landing
    // Public quiz pages — no auth, hosted at /q/[slug]
    "/q/",
    // Embeddable quiz pages — no auth, for iframe embedding on coach sites
    "/embed/",
    // Public Brand OS Snapshot — free, anonymous, email-gated at the marketing site
    "/snapshot",
    // Public referral page — coaches share Brand OS with friends
    "/refer",
    // Positioned-to-Win Scorecard — public top-of-funnel lead magnet
    "/win",
    // Meet-your-assistant teaser quiz — public pre-signup interview
    "/meet",
  ];
  const isApi = path.startsWith("/api/");
  const isPublic = isApi || publicPaths.some((p) => path.startsWith(p));

  if (!user && !isPublic) {
    return redirectWithCookies("/login", request, response);
  }

  if (user && path === "/login") {
    // Already signed in. If the link carried ?next=, respect it — this is
    // how the post-call email Cards 01/02 take a signed-in admin straight
    // to /welcome or /brand-os/start-snapshot. Otherwise default home.
    const nextRaw = request.nextUrl.searchParams.get("next");
    const next = nextRaw && nextRaw.startsWith("/") ? nextRaw : "/command-center";
    return redirectWithCookies(next, request, response);
  }

  // First-time activation gate. Only checks on root + main-app entry points
  // so navigation between /inbox ↔ /leads/123 doesn't fire a query per click.
  // The pages we check on are the ones a coach is most likely to land on
  // straight after sign-in.
  if (user && !isPublic) {
    const ACTIVATION_GATES = [
      "/",
      "/command-center",
      "/today",
      "/inbox",
      "/clients",
      "/decisions",
      "/analytics",
      "/voice",
    ];
    const onGate = ACTIVATION_GATES.some(
      (g) => path === g || (g !== "/" && path.startsWith(g + "?"))
    );

    if (onGate) {
      // Single round-trip: we only need to know if EITHER condition is
      // satisfied (has voice profile OR has any lead). Use a HEAD count on
      // each table. Fast, no row data transferred.
      const [profileRes, leadsRes] = await Promise.all([
        supabase
          .from("cp_voice_profiles")
          .select("id", { count: "exact", head: true })
          .eq("coach_id", user.id)
          .eq("active", true),
        supabase
          .from("cp_leads")
          .select("id", { count: "exact", head: true })
          .eq("coach_id", user.id),
      ]);

      const hasProfile = (profileRes.count ?? 0) > 0;
      const hasLeads = (leadsRes.count ?? 0) > 0;

      if (!hasProfile && !hasLeads) {
        return redirectWithCookies("/welcome", request, response);
      }
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
