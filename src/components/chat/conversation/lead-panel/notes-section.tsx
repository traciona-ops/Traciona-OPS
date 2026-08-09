"use client";

import { useState } from "react";
import { Plus, StickyNote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { addNote } from "@/app/(dashboard)/crm/actions";
import { SECTION_LABEL_ICON, type RunMutation } from "@/components/chat/conversation/lead-panel/ui";
import type { LeadContext } from "@/components/chat/types";

export function NotesSection({
  leadId,
  notes,
  busy,
  run,
}: {
  leadId: string;
  notes: LeadContext["notes"];
  busy: boolean;
  run: RunMutation;
}) {
  const [note, setNote] = useState("");

  return (
    <div>
      <label className={SECTION_LABEL_ICON}>
        <StickyNote className="h-3 w-3" /> Notas internas
      </label>
      <div className="mb-2 space-y-1.5">
        {notes.slice(0, 5).map((n) => (
          <div key={n.id} className="rounded-lg bg-[var(--color-surface-2)] p-2 text-xs">
            <p className="whitespace-pre-wrap">{n.content}</p>
            <p className="mt-1 text-[11px] text-[var(--color-muted-2)]">
              {n.author?.name ?? "—"} ·{" "}
              {new Date(n.created_at).toLocaleDateString("pt-BR")}
            </p>
          </div>
        ))}
      </div>
      <div className="flex gap-1.5">
        <Textarea
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Anotação (não vai pro WhatsApp)"
        />
        <Button
          size="sm"
          variant="secondary"
          disabled={busy || !note.trim()}
          onClick={() => {
            run(() => addNote(leadId, note.trim()));
            setNote("");
          }}
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
