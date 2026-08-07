import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/login", request.url), { status: 303 });
}

// GET: usado pelo redirect de conta desativada (server component não consegue
// limpar cookie — precisa passar por um route handler).
export async function GET(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const url = new URL(request.url);
  const inactive = url.searchParams.get("inactive");
  return NextResponse.redirect(
    new URL(inactive ? "/login?inactive=1" : "/login", request.url),
    { status: 303 }
  );
}
