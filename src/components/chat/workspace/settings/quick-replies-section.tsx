"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import {
  createQuickReply,
  deleteQuickReply,
  listQuickReplies,
} from "@/app/(dashboard)/crm/whatsapp-actions";
import type { QuickReply } from "@/lib/types";

/** Templates com atalho `/` usados dentro da conversa. */
export function QuickRepliesSection() {
  const [list, setList] = useState<QuickReply[] | null>(null);
  const [title, setTitle] = useState("");
  const [shortcut, setShortcut] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    const r = await listQuickReplies();
    if ("quickReplies" in r) setList(r.quickReplies as QuickReply[]);
  }
  useEffect(() => {
    load();
  }, []);

  async function add() {
    if (!title.trim() || !content.trim()) return;
    setSaving(true);
    await createQuickReply({
      title: title.trim(),
      content: content.trim(),
      shortcut: shortcut.trim() || undefined,
    });
    setSaving(false);
    setTitle("");
    setShortcut("");
    setContent("");
    load();
  }

  async function remove(id: string) {
    setList((prev) => (prev ?? []).filter((q) => q.id !== id));
    await deleteQuickReply(id);
    load();
  }

  const field =
    "h-10 rounded-[var(--radius-field)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 text-sm focus:border-[var(--chat-accent)] focus:outline-none";

  return (
    <>
      <div className="card p-5">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Templates</h3>
          <span className="text-[11px] text-[var(--color-muted-2)]">
            {list ? `${list.length} salvos` : "…"}
          </span>
        </div>
        <p className="mb-3 text-[11px] text-[var(--color-muted-2)]">
          Na conversa, digite <b>/</b> pra usar. Variáveis: {"{nome}"},{" "}
          {"{saudacao}"}, {"{meu_nome}"}.
        </p>
        {list === null ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-4 w-4 animate-spin text-[var(--color-muted)]" />
          </div>
        ) : list.length === 0 ? (
          <p className="py-4 text-center text-xs text-[var(--color-muted-2)]">
            Nenhum template ainda — crie o primeiro abaixo.
          </p>
        ) : (
          <div className="divide-y divide-[var(--color-border)]/60">
            {list.map((q) => (
              <div key={q.id} className="flex items-start gap-2 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 text-sm font-medium">
                    <span className="truncate">{q.title}</span>
                    {q.shortcut && (
                      <span className="shrink-0 rounded bg-[var(--chat-accent)]/10 px-1 font-mono text-[11px] text-[var(--chat-accent)]">
                        /{q.shortcut.replace(/^\//, "")}
                      </span>
                    )}
                  </p>
                  <p className="truncate text-[11px] text-[var(--color-muted-2)]">
                    {q.content}
                  </p>
                </div>
                <button
                  onClick={() => remove(q.id)}
                  aria-label={`Excluir template ${q.title}`}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-control)] text-[var(--color-muted-2)] transition hover:bg-[var(--color-danger)]/10 hover:text-[var(--color-danger)]"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card space-y-2.5 p-5">
        <h3 className="text-sm font-semibold">Novo template</h3>
        <div className="flex gap-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Título"
            className={`${field} min-w-0 flex-1`}
          />
          <input
            value={shortcut}
            onChange={(e) => setShortcut(e.target.value)}
            placeholder="/atalho"
            className={`${field} w-28 font-mono`}
          />
        </div>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={3}
          placeholder="Mensagem (use {nome}, {saudacao}, {meu_nome})"
          className="w-full resize-none rounded-[var(--radius-field)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-2.5 text-sm focus:border-[var(--chat-accent)] focus:outline-none"
        />
        <button
          onClick={add}
          disabled={saving || !title.trim() || !content.trim()}
          className="flex h-10 w-full items-center justify-center gap-2 rounded-[var(--radius-control)] bg-[var(--chat-accent)] text-sm font-semibold text-[var(--color-primary-foreground)] transition hover:brightness-105 disabled:opacity-50"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          Salvar template
        </button>
      </div>
    </>
  );
}
