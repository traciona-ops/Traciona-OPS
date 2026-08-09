"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Search, UserPlus } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { createClient } from "@/lib/supabase/client";
import { startConversation } from "@/app/(dashboard)/crm/whatsapp-actions";

export type LeadHit = {
  id: string;
  name: string;
  phone: string | null;
  avatar_url: string | null;
};

/**
 * Painel "nova conversa": busca um lead existente (mesmo sem conversa) ou
 * cria contato novo. Número repetido cai no lead que já existe, sem duplicar.
 */
export function NewConversation({
  onPick,
  onCreated,
}: {
  onPick: (lead: LeadHit) => void;
  onCreated: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LeadHit[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // busca leads existentes enquanto digita (debounce de 250ms)
  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      const { data } = await supabase.rpc("search_leads", { q: term });
      setResults(((data ?? []) as LeadHit[]).slice(0, 8));
    }, 250);
    return () => clearTimeout(t);
  }, [query, supabase]);

  async function createContact() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const r = await startConversation({ phone, name });
    setBusy(false);
    if ("error" in r && r.error) {
      setError(r.error);
      return;
    }
    if ("lead" in r && r.lead) {
      onPick(r.lead as LeadHit);
      onCreated();
    }
  }

  const field =
    "h-9 w-full rounded-[var(--radius-field)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 text-xs transition focus:border-[var(--color-primary)] focus:outline-none";

  return (
    <div className="border-b border-[var(--color-border)] bg-[var(--color-surface-2)]/40 px-4 py-3">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted-2)]">
        Nova conversa
      </p>
      <div className="flex h-9 items-center gap-2 rounded-[var(--radius-field)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 transition focus-within:border-[var(--color-primary)]">
        <Search className="h-3.5 w-3.5 text-[var(--color-muted-2)]" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar lead por nome ou número"
          autoFocus
          className="w-full bg-transparent text-xs outline-none placeholder:text-[var(--color-muted-2)] focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
        />
      </div>
      {results.length > 0 && (
        <div className="mt-2 max-h-44 divide-y divide-[var(--color-border)]/60 overflow-y-auto rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm">
          {results.map((l) => (
            <button
              key={l.id}
              onClick={() => onPick(l)}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-[var(--color-surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-primary)]"
            >
              <Avatar name={l.name} src={l.avatar_url} size={30} />
              <div className="min-w-0">
                <p className="truncate text-xs font-medium">{l.name}</p>
                <p className="truncate text-[11px] text-[var(--color-muted-2)]">
                  {l.phone ?? "sem telefone"}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}

      <div className="my-3 flex items-center gap-2">
        <span className="h-px flex-1 bg-[var(--color-border)]" />
        <span className="text-[11px] font-medium uppercase tracking-wider text-[var(--color-muted-2)]">
          ou novo contato
        </span>
        <span className="h-px flex-1 bg-[var(--color-border)]" />
      </div>

      <div className="space-y-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nome"
          className={field}
        />
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && createContact()}
          placeholder="WhatsApp (ex.: 5511999998888)"
          className={field}
        />
        {error && (
          <p className="rounded-[var(--radius-card)] bg-[var(--color-danger)]/10 px-3 py-2 text-[11px] text-[var(--color-danger)]">
            {error}
          </p>
        )}
        <button
          onClick={createContact}
          disabled={busy || !phone.trim()}
          className="flex h-9 w-full items-center justify-center gap-1.5 rounded-[var(--radius-control)] bg-[var(--chat-accent)] text-xs font-semibold text-[var(--color-primary-foreground)] shadow-sm transition hover:opacity-90 disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <UserPlus className="h-3.5 w-3.5" />
          )}
          Criar e abrir conversa
        </button>
        <p className="text-[11px] leading-relaxed text-[var(--color-muted-2)]">
          Número repetido abre a conversa do lead existente, sem duplicar.
        </p>
      </div>
    </div>
  );
}
