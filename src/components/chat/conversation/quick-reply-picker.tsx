"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import {
  createQuickReply,
  deleteQuickReply,
} from "@/app/(dashboard)/crm/whatsapp-actions";
import type { QuickReply } from "@/lib/types";

export function QuickReplyPicker({
  quickReplies,
  onPick,
  onClose,
  query = "",
  onQuery,
}: {
  quickReplies: QuickReply[];
  onPick: (content: string) => void;
  onClose: () => void;
  query?: string;
  onQuery?: (q: string) => void;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [shortcut, setShortcut] = useState("");
  const [content, setContent] = useState("");

  const q = query.trim().toLowerCase();
  const filtered = q
    ? quickReplies.filter((r) =>
        `${r.title} ${r.shortcut ?? ""} ${r.content}`.toLowerCase().includes(q)
      )
    : quickReplies;

  async function add() {
    if (!title.trim() || !content.trim()) return;
    await createQuickReply({
      title,
      content,
      shortcut: shortcut.trim() || undefined,
    });
    setTitle("");
    setShortcut("");
    setContent("");
    setAdding(false);
    router.refresh();
  }

  return (
    <>
      <div className="fixed inset-0 z-10" onClick={onClose} />
      <div className="absolute bottom-12 left-0 z-20 w-72 rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-2 shadow-xl">
        <div className="mb-1 flex items-center justify-between px-1">
          <span className="text-xs font-semibold">Respostas rápidas</span>
          <button
            onClick={() => setAdding((a) => !a)}
            className="text-xs text-[var(--color-primary)]"
          >
            {adding ? "Cancelar" : "+ Nova"}
          </button>
        </div>
        <div className="mb-1.5 flex h-8 items-center gap-1.5 rounded-lg bg-[var(--color-surface-2)] px-2">
          <Search className="h-3 w-3 text-[var(--color-muted-2)]" />
          <input
            value={query}
            onChange={(e) => onQuery?.(e.target.value)}
            placeholder="Buscar (ou digite / na mensagem)"
            className="w-full bg-transparent text-xs outline-none placeholder:text-[var(--color-muted-2)]"
            autoFocus={!query}
          />
        </div>
        {adding && (
          <div className="mb-2 space-y-1.5 rounded-lg bg-[var(--color-surface-2)] p-2">
            <div className="flex gap-1.5">
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Título"
                className="h-8 flex-1 text-xs"
              />
              <Input
                value={shortcut}
                onChange={(e) => setShortcut(e.target.value)}
                placeholder="/atalho"
                className="h-8 w-20 text-xs"
              />
            </div>
            <Textarea
              rows={2}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Mensagem (use {nome}, {saudacao}, {meu_nome})"
            />
            <Button size="sm" className="w-full" onClick={add}>
              Salvar template
            </Button>
          </div>
        )}
        <div className="max-h-64 space-y-1 overflow-y-auto">
          {filtered.length === 0 && (
            <p className="px-1 text-xs text-[var(--color-muted-2)]">
              {q ? "Nada encontrado." : "Nenhuma resposta rápida."}
            </p>
          )}
          {filtered.map((qr) => (
            <div
              key={qr.id}
              className="group flex items-start gap-1 rounded-lg px-2 py-1.5 hover:bg-[var(--color-surface-2)]"
            >
              <button
                onClick={() => onPick(qr.content)}
                className="min-w-0 flex-1 text-left"
              >
                <p className="flex items-center gap-1.5 text-xs font-medium">
                  <span className="truncate">{qr.title}</span>
                  {qr.shortcut && (
                    <span className="shrink-0 rounded bg-[var(--color-primary)]/10 px-1 font-mono text-[11px] text-[var(--color-primary)]">
                      /{qr.shortcut.replace(/^\//, "")}
                    </span>
                  )}
                </p>
                <p className="truncate text-[11px] text-[var(--color-muted)]">
                  {qr.content}
                </p>
              </button>
              <button
                onClick={async () => {
                  await deleteQuickReply(qr.id);
                  router.refresh();
                }}
                className="text-[var(--color-muted-2)] opacity-0 transition hover:text-[var(--color-danger)] group-hover:opacity-100"
                aria-label="Excluir"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
