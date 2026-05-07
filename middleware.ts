import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type CookieToSet = {
  name: string;
  value: string;
  options: CookieOptions;
};

// Auth gate + first-time onboarding redirect.
//
// 1. Public paths (/login, /auth/callback, /welcome) are open.
// 2. Signed-out users hit /login.
// 3. Signed-in users with NO voice profile AND NO leads get redirected to
//    /welcome on their first visit to a "main app" page (/command-center, /inbox,
//    /decisions, /voice, /settings, /). Once they finish onboarding (or
//    skip with the explicit Skip button), they land on /command-center and the
//    redirect stops firing because hasProfile or hasLeads will be true.
//
// Why /welcome is publicly accessible: it has its own server-side guard
// that checks profile + leads count. Without that, a coach who DID
// complete activation could come back to /welcome via ?force=1 to redo
// voice or replay the magic moment.

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
  const publicPaths = ["/login", "/auth/callback", "/welcome"];
  const isApi = path.startsWith("/api/");
  const isPublic = isApi || publicPaths.some((p) => path.startsWith(p));

  if (!user && !isPublic) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (user && path === "/login") {
    return NextResponse.redirect(new URL("/command-center", request.url));
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
        return NextResponse.redirect(new URL("/welcome", request.url));
      }
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
