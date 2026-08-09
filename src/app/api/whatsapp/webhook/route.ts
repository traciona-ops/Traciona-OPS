import { NextResponse } from "next/server";

export async function POST(req: Request) {
  // WhatsApp webhook stub - accepts incoming messages
  return NextResponse.json({ ok: true });
}

export async function GET(request: Request) {
  // WhatsApp webhook verification
  const challenge = new URL(request.url).searchParams.get("challenge");
  if (challenge) {
    return new Response(challenge);
  }
  return NextResponse.json({ ok: true });
}
