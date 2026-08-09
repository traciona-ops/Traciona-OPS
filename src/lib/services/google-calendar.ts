import { calendar_v3 } from "googleapis";

const SCOPES = ["https://www.googleapis.com/auth/calendar"];

export interface GoogleCalendarEvent {
  id: string;
  summary: string;
  start: { dateTime: string } | { date: string };
  end: { dateTime: string } | { date: string };
  description?: string;
  location?: string;
  conferenceData?: { entryPoints: Array<{ uri: string }> };
}

export async function createGoogleAuthClient(refreshToken: string) {
  const { google } = await import("googleapis");

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_CALENDAR_REDIRECT_URI
  );

  oauth2Client.setCredentials({
    refresh_token: refreshToken,
  });

  return oauth2Client;
}

export async function createCalendarEvent(
  refreshToken: string,
  calendarId: string,
  event: {
    summary: string;
    description?: string;
    startTime: Date;
    endTime: Date;
    generateMeetLink?: boolean;
  }
) {
  try {
    const { google } = await import("googleapis");
    const auth = await createGoogleAuthClient(refreshToken);
    const calendar = google.calendar({ version: "v3", auth });

    const eventBody: calendar_v3.Schema$Event = {
      summary: event.summary,
      description: event.description,
      start: { dateTime: event.startTime.toISOString() },
      end: { dateTime: event.endTime.toISOString() },
    };

    if (event.generateMeetLink) {
      eventBody.conferenceData = {
        createRequest: { requestId: `meet-${Date.now()}` },
      };
    }

    const result = await calendar.events.insert({
      calendarId,
      requestBody: eventBody,
      conferenceDataVersion: event.generateMeetLink ? 1 : 0,
    });

    return result.data;
  } catch (error) {
    console.error("Google Calendar API Error:", error);
    throw error;
  }
}

export async function updateCalendarEvent(
  refreshToken: string,
  calendarId: string,
  eventId: string,
  event: Partial<{
    summary: string;
    description?: string;
    location?: string;
    startTime: Date;
    endTime: Date;
  }>
) {
  const { google } = await import("googleapis");
  const auth = await createGoogleAuthClient(refreshToken);
  const calendar = google.calendar({ version: "v3", auth });

  const eventBody: calendar_v3.Schema$Event = {};
  if (event.summary) eventBody.summary = event.summary;
  if (event.description) eventBody.description = event.description;
  if (event.location) eventBody.location = event.location;
  if (event.startTime) eventBody.start = { dateTime: event.startTime.toISOString() };
  if (event.endTime) eventBody.end = { dateTime: event.endTime.toISOString() };

  const result = await calendar.events.update({
    calendarId,
    eventId,
    requestBody: eventBody,
  });

  return result.data;
}

export async function deleteCalendarEvent(
  refreshToken: string,
  calendarId: string,
  eventId: string
) {
  const { google } = await import("googleapis");
  const auth = await createGoogleAuthClient(refreshToken);
  const calendar = google.calendar({ version: "v3", auth });

  await calendar.events.delete({
    calendarId,
    eventId,
  });
}

export async function getCalendarEvents(
  refreshToken: string,
  calendarId: string,
  timeMin?: Date,
  timeMax?: Date
): Promise<GoogleCalendarEvent[]> {
  const { google } = await import("googleapis");
  const auth = await createGoogleAuthClient(refreshToken);
  const calendar = google.calendar({ version: "v3", auth });

  const result = await calendar.events.list({
    calendarId,
    timeMin: timeMin?.toISOString(),
    timeMax: timeMax?.toISOString(),
    singleEvents: true,
    orderBy: "startTime",
  });

  return (result.data.items || []) as GoogleCalendarEvent[];
}
