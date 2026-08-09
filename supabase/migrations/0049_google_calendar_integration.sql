-- Google Calendar integration
CREATE TABLE calendar_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  google_calendar_id TEXT NOT NULL,
  google_refresh_token TEXT NOT NULL,
  google_access_token TEXT,
  google_access_token_expires_at TIMESTAMP,
  last_sync_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now(),
  UNIQUE(user_id)
);

-- Company calendar (shared, one per workspace)
CREATE TABLE company_calendars (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  google_calendar_id TEXT NOT NULL UNIQUE,
  google_service_account_key JSONB,
  created_at TIMESTAMP DEFAULT now(),
  UNIQUE(workspace_id)
);

-- Track which events are synced to Google
ALTER TABLE meetings ADD COLUMN google_event_ids JSONB DEFAULT '{}';
ALTER TABLE meetings ADD COLUMN synced_to_google_at TIMESTAMP;

-- RLS for calendar_integrations
ALTER TABLE calendar_integrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own calendar integration"
  ON calendar_integrations FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "Users insert own calendar integration"
  ON calendar_integrations FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own calendar integration"
  ON calendar_integrations FOR UPDATE
  USING (auth.uid() = user_id);

-- RLS for company_calendars (admins only)
ALTER TABLE company_calendars ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins see company calendar"
  ON company_calendars FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );
CREATE POLICY "Admins manage company calendar"
  ON company_calendars FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );
