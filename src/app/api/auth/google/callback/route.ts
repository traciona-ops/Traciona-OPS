import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const error = request.nextUrl.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(
      new URL(`/settings/integracao?error=${error}`, request.url)
    );
  }

  if (!code) {
    return NextResponse.redirect(
      new URL("/settings/integracao?error=missing_code", request.url)
    );
  }

  try {
    const { google } = await import("googleapis");
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_CALENDAR_REDIRECT_URI
    );

    const { tokens } = await oauth2Client.getToken(code);
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.redirect(
        new URL("/auth/login", request.url)
      );
    }

    oauth2Client.setCredentials(tokens);
    const calendarClient = google.calendar({ version: "v3", auth: oauth2Client });

    const calendarList = await calendarClient.calendarList.list();
    const primaryCalendar = calendarList.data.items?.find(
      (cal) => cal.primary
    );

    if (!primaryCalendar?.id) {
      return NextResponse.redirect(
        new URL(
          "/settings/integracao?error=no_primary_calendar",
          request.url
        )
      );
    }

    const { error: upsertError } = await supabase.from("calendar_integrations").upsert({
      user_id: user.id,
      google_calendar_id: primaryCalendar.id,
      google_refresh_token: tokens.refresh_token,
      google_access_token: tokens.access_token,
      google_access_token_expires_at: tokens.expiry_date
        ? new Date(tokens.expiry_date)
        : null,
    });

    if (upsertError) {
      console.error("Upsert error:", upsertError);
      return NextResponse.redirect(
        new URL(
          `/settings/integracao?error=upsert_failed&details=${upsertError.message}`,
          request.url
        )
      );
    }

    return NextResponse.redirect(
      new URL("/settings/integracao?success=google_connected", request.url)
    );
  } catch (error) {
    console.error("Google OAuth error:", error);
    return NextResponse.redirect(
      new URL("/settings/integracao?error=oauth_failed", request.url)
    );
  }
}
