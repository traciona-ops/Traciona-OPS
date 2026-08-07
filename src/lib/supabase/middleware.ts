import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// "/f" = OPS Form público; "/api/asaas" = webhook de pagamentos do Asaas
const PUBLIC_PATHS = [
  "/login",
  "/auth",
  "/api/whatsapp",
  "/api/cron",
  "/api/asaas",
  "/f/",
  "/o/",
];

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
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
  const isPublic = PUBLIC_PATHS.some((p) => path.startsWith(p));

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    // VibeUX 17: depois de logar, a pessoa volta pra onde tentava ir
    if (path !== "/") url.searchParams.set("redirect", path);
    return NextResponse.redirect(url);
  }

  if (user && path === "/login") {
    const url = request.nextUrl.clone();
    const dest = url.searchParams.get("redirect");
    url.search = "";
    url.pathname =
      dest && dest.startsWith("/") && !dest.startsWith("//") ? dest : "/";
    return NextResponse.redirect(url);
  }

  return response;
}
