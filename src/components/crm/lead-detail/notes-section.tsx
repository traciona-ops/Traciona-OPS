"use client";

import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import type { LeadNote } from "@/lib/types";

export function NotesSection({
  notes,
  note,
  savingNote,
  onNoteChange,
  onSubmit,
}: {
  notes: (LeadNote & { author?: { name: string } })[];
  note: string;
  savingNote: boolean;
  onNoteChange: (value: string) => void;
  onSubmit: () => void;
}) {
  return (
    <div className="card p-5">
      <h3 className="mb-3 text-sm font-semibold">Anotações</h3>
      <div className="mb-4 flex gap-2">
        <Textarea
          rows={2}
          value={note}
          onChange={(e) => onNoteChange(e.target.value)}
          placeholder="Adicionar anotação..."
        />
        <Button onClick={onSubmit} disabled={savingNote || !note.trim()}>
          {savingNote ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar"}
        </Button>
      </div>
      <div className="space-y-3">
        {notes.length === 0 && (
          <p className="text-sm text-[var(--color-muted-2)]">Nenhuma anotação ainda.</p>
        )}
        {notes.map((n) => (
          <div key={n.id} className="rounded-lg bg-[var(--color-surface-2)] p-3">
            <p className="text-sm">{n.content}</p>
            <p className="mt-1.5 text-[11px] text-[var(--color-muted-2)]">
              {n.author?.name ?? "—"} · {new Date(n.created_at).toLocaleString("pt-BR")}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
