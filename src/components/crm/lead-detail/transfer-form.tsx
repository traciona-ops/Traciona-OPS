"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { transferLead } from "@/app/(dashboard)/crm/actions";
import type { Profile } from "@/lib/types";

export function TransferForm({
  leadId,
  team,
  onDone,
}: {
  leadId: string;
  team: Profile[];
  onDone: () => void;
}) {
  const [to, setTo] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);

  return (
    <div className="mt-3 space-y-2">
      <select
        value={to}
        onChange={(e) => setTo(e.target.value)}
        className="h-10 w-full rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-2 text-sm"
      >
        <option value="">Selecionar vendedor...</option>
        {team.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
      <Input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Motivo (opcional)"
        className="h-10 text-xs"
      />
      <Button
        size="sm"
        className="w-full"
        disabled={!to || loading}
        onClick={async () => {
          setLoading(true);
          await transferLead(leadId, to, reason);
          onDone();
        }}
      >
        {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        Confirmar transferência
      </Button>
    </div>
  );
}
