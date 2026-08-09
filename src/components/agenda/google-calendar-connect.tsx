"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createClient } from "@supabase/supabase-js";
import { Check, Calendar } from "lucide-react";

interface CalendarIntegration {
  id: string;
  google_calendar_id: string;
  last_sync_at: string | null;
}

export function GoogleCalendarConnect() {
  const [integration, setIntegration] = useState<CalendarIntegration | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const searchParams = useSearchParams();

  const fetchIntegration = async () => {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || "",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
    );
    const { data } = await supabase
      .from("calendar_integrations")
      .select("*")
      .single();

    setIntegration(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchIntegration();
  }, []);

  useEffect(() => {
    if (searchParams.get("success") === "google_connected") {
      fetchIntegration();
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [searchParams]);

  const handleConnect = () => {
    window.location.href = "/api/auth/google";
  };

  const handleDisconnect = async () => {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || "",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
    );
    await supabase.from("calendar_integrations").delete();
    setIntegration(null);
  };

  if (loading) return <div className="text-sm text-[var(--color-muted)]">Carregando...</div>;

  const status = loading ? null : integration ? { ok: true, detail: "" } : { ok: false, detail: "Não configurado" };

  return (
    <div className="rounded-xl border border-[var(--color-border)] p-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/integrations/google-calendar.png"
            alt="Google Calendar"
            className="h-7 w-7 object-contain"
            loading="lazy"
          />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Google Calendar</p>
          <p className="truncate text-xs text-[var(--color-muted)]">Sincronize automaticamente suas reuniões</p>
        </div>

        {loading ? (
          <Calendar className="h-4 w-4 animate-spin text-[var(--color-muted-2)]" />
        ) : integration ? (
          <span className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium bg-[color-mix(in_srgb,var(--color-success)_12%,var(--color-surface))] text-[var(--color-success)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-success)]" />
            Conectado
          </span>
        ) : (
          <span className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium bg-[var(--color-surface-2)] text-[var(--color-muted-2)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-muted-2)]" />
            Não configurado
          </span>
        )}
      </div>

      {!loading && integration?.last_sync_at && (
        <p className="mt-2 text-xs text-[var(--color-muted)]">
          Última sincronização: {new Date(integration.last_sync_at).toLocaleString("pt-BR")}
        </p>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (integration) handleDisconnect();
          else handleConnect();
        }}
        className="mt-3 flex flex-wrap items-center gap-2"
      >
        <button
          type="submit"
          disabled={loading}
          className="flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-[var(--color-primary)] px-4 text-sm font-medium text-[var(--color-primary-foreground)] shadow-sm transition hover:opacity-90 disabled:opacity-50"
        >
          {integration ? "Desconectar" : "Testar e salvar"}
        </button>
      </form>
    </div>
  );
}
