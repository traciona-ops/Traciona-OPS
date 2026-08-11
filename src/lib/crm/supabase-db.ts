import type { SupabaseClient } from "@supabase/supabase-js";

/** Cliente Supabase (sessão com RLS ou admin) usado nos casos de uso do CRM. */
export type CrmDb = SupabaseClient;
