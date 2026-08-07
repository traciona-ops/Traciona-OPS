"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  Copy,
  Folder,
  FolderPlus,
  History,
  Loader2,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Wand2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, Drawer } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/toast";
import {
  createPromptFolder,
  deletePromptFolder,
  createPrompt,
  savePrompt,
  deletePrompt,
  getPromptVersions,
  restorePromptVersion,
} from "@/app/(dashboard)/prompts/actions";

// Biblioteca de Prompts: pastas à esquerda, lista no meio, editor em foco.
// Variáveis [ASSIM] viram campos preenchíveis no "Usar prompt".

export type FolderRow = { id: string; name: string; position: number };
export type PromptRow = {
  id: string;
  folder_id: string | null;
  title: string;
  content: string;
  updated_at: string;
};

const VAR_RE = /\[([A-ZÀ-Ú0-9_]{2,40})\]/g;

const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function PromptsView({
  folders,
  prompts,
}: {
  folders: FolderRow[];
  prompts: PromptRow[];
}) {
  const router = useRouter();
  const [folderId, setFolderId] = useState<string | "all">("all");
  const [selectedId, setSelectedId] = useState<string | null>(
    prompts[0]?.id ?? null
  );
  const [query, setQuery] = useState("");
  const [newFolder, setNewFolder] = useState(false);
  const [folderName, setFolderName] = useState("");

  const list = useMemo(() => {
    const q = norm(query.trim());
    return prompts.filter((p) => {
      if (folderId !== "all" && p.folder_id !== folderId) return false;
      if (!q) return true;
      return norm(p.title).includes(q) || norm(p.content).includes(q);
    });
  }, [prompts, folderId, query]);

  const selected = prompts.find((p) => p.id === selectedId) ?? null;

  async function addFolder(e: React.FormEvent) {
    e.preventDefault();
    const r = await createPromptFolder(folderName);
    if (r?.error) toast(r.error, { type: "error" });
    else {
      setFolderName("");
      setNewFolder(false);
      router.refresh();
    }
  }

  async function removeFolder(f: FolderRow) {
    if (!confirm(`Excluir a pasta "${f.name}"? Os prompts dela ficam em Todos.`))
      return;
    const r = await deletePromptFolder(f.id);
    if (r?.error) toast(r.error, { type: "error" });
    else {
      if (folderId === f.id) setFolderId("all");
      router.refresh();
    }
  }

  async function addPrompt() {
    const r = await createPrompt(folderId === "all" ? null : folderId, "Novo prompt");
    if (r?.error) toast(r.error, { type: "error" });
    else {
      setSelectedId(r.id!);
      router.refresh();
    }
  }

  const countBy = (fid: string | null) =>
    prompts.filter((p) => (fid === null ? true : p.folder_id === fid)).length;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden md:flex-row">
      {/* ---- PASTAS ---- */}
      <aside className="flex shrink-0 gap-1.5 overflow-x-auto border-b border-[var(--color-border)] p-2.5 md:w-56 md:flex-col md:overflow-y-auto md:border-b-0 md:border-r md:p-3">
        <FolderBtn
          active={folderId === "all"}
          onClick={() => setFolderId("all")}
          name="Todos os prompts"
          count={countBy(null)}
        />
        {folders.map((f) => (
          <FolderBtn
            key={f.id}
            active={folderId === f.id}
            onClick={() => setFolderId(f.id)}
            name={f.name}
            count={countBy(f.id)}
            onDelete={() => removeFolder(f)}
          />
        ))}
        {newFolder ? (
          <form onSubmit={addFolder} className="flex shrink-0 items-center gap-1">
            <input
              autoFocus
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
              placeholder="Nome da pasta"
              className="h-9 w-36 min-w-0 flex-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 text-sm outline-none focus:border-[var(--color-primary)] focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
            />
            <button
              type="submit"
              aria-label="Confirmar nova pasta"
              className="flex min-h-9 min-w-9 items-center justify-center rounded-lg text-[var(--color-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
            >
              <Check className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setNewFolder(false)}
              aria-label="Cancelar nova pasta"
              className="flex min-h-9 min-w-9 items-center justify-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
            >
              <X className="h-4 w-4 text-[var(--color-muted)]" />
            </button>
          </form>
        ) : (
          <button
            onClick={() => setNewFolder(true)}
            className="flex shrink-0 items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-[var(--color-muted-2)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
          >
            <FolderPlus className="h-4 w-4" />
            Nova pasta
          </button>
        )}
      </aside>

      {/* ---- LISTA ---- */}
      <div className="flex w-full shrink-0 flex-col border-b border-[var(--color-border)] md:w-72 md:border-b-0 md:border-r">
        <div className="flex items-center gap-2 p-2.5">
          <label className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5">
            <Search className="h-3.5 w-3.5 shrink-0 text-[var(--color-muted-2)]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar prompt"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--color-muted-2)]"
            />
          </label>
          <Button size="icon-sm" onClick={addPrompt} aria-label="Novo prompt">
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="max-h-40 flex-1 overflow-y-auto md:max-h-none">
          {list.map((p) => (
            <button
              key={p.id}
              onClick={() => setSelectedId(p.id)}
              className={cn(
                "block w-full border-b border-[var(--color-border)] px-3.5 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-inset",
                selectedId === p.id
                  ? "bg-[var(--color-primary)]/8"
                  : "hover:bg-[var(--color-surface-2)]/60"
              )}
            >
              <p className="truncate text-sm font-medium">{p.title}</p>
              <p className="mt-0.5 truncate text-xs text-[var(--color-muted-2)]">
                {p.content.replace(/\s+/g, " ").slice(0, 60) || "Vazio"}
              </p>
            </button>
          ))}
          {!list.length && (
            <p className="px-4 py-8 text-center text-sm text-[var(--color-muted-2)]">
              Nenhum prompt aqui ainda.
            </p>
          )}
        </div>
      </div>

      {/* ---- EDITOR ---- */}
      <div className="min-w-0 flex-1 overflow-y-auto bg-[var(--color-background)]">
        {selected ? (
          <Editor
            key={selected.id}
            prompt={selected}
            folders={folders}
            onChanged={() => router.refresh()}
            onDeleted={() => {
              setSelectedId(null);
              router.refresh();
            }}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center p-10 text-center">
            <Sparkles className="mb-3 h-8 w-8 text-[var(--color-muted-2)]" />
            <p className="max-w-xs text-sm text-[var(--color-muted)]">
              Escolhe um prompt ou cria um novo. Usa variáveis como
              [NOME_DO_PRODUTO] pra preencher na hora de usar.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function FolderBtn({
  active,
  onClick,
  name,
  count,
  onDelete,
}: {
  active: boolean;
  onClick: () => void;
  name: string;
  count: number;
  onDelete?: () => void;
}) {
  return (
    <div
      className={cn(
        "group flex shrink-0 items-center gap-2 rounded-lg px-2.5 py-2 transition-colors",
        active
          ? "bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
          : "text-[var(--color-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-foreground)]"
      )}
    >
      <button
        onClick={onClick}
        className="flex min-w-0 flex-1 items-center gap-2 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
      >
        <Folder className="h-4 w-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate text-sm">{name}</span>
        <span
          className={cn(
            "shrink-0 text-[11px]",
            active ? "text-[var(--color-primary-foreground)]/70" : "text-[var(--color-muted-2)]"
          )}
        >
          {count}
        </span>
      </button>
      {onDelete && (
        <button
          onClick={onDelete}
          aria-label="Excluir pasta"
          title="Excluir pasta"
          className={cn(
            "hidden min-h-9 min-w-9 shrink-0 items-center justify-center rounded-lg group-hover:flex focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]",
            active ? "text-[var(--color-primary-foreground)]/80" : "text-[var(--color-muted-2)] hover:text-[var(--color-danger)]"
          )}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

/* ------------------------- editor ------------------------- */

function Editor({
  prompt,
  folders,
  onChanged,
  onDeleted,
}: {
  prompt: PromptRow;
  folders: FolderRow[];
  onChanged: () => void;
  onDeleted: () => void;
}) {
  const [title, setTitle] = useState(prompt.title);
  const [content, setContent] = useState(prompt.content);
  const [saving, setSaving] = useState(false);
  const [using, setUsing] = useState(false);
  const [history, setHistory] = useState<
    | null
    | { id: string; content: string; created_at: string; author: { name: string } | null }[]
  >(null);
  const dirty = title !== prompt.title || content !== prompt.content;

  const variables = useMemo(
    () => [...new Set([...content.matchAll(VAR_RE)].map((m) => m[1]))],
    [content]
  );

  async function save() {
    setSaving(true);
    const r = await savePrompt(prompt.id, { title, content });
    setSaving(false);
    if (r?.error) toast(r.error, { type: "error" });
    else {
      toast("Prompt salvo — versão anterior guardada no histórico.");
      onChanged();
    }
  }

  async function moveFolder(fid: string) {
    const r = await savePrompt(prompt.id, { folderId: fid || null });
    if (r?.error) toast(r.error, { type: "error" });
    else onChanged();
  }

  async function remove() {
    if (!confirm(`Excluir "${prompt.title}"? Histórico vai junto.`)) return;
    const r = await deletePrompt(prompt.id);
    if (r?.error) toast(r.error, { type: "error" });
    else onDeleted();
  }

  async function openHistory() {
    setHistory(await getPromptVersions(prompt.id));
  }

  async function restore(versionId: string) {
    const r = await restorePromptVersion(prompt.id, versionId);
    if (r?.error) toast(r.error, { type: "error" });
    else {
      toast("Versão restaurada.");
      setHistory(null);
      onChanged();
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="h-11 min-w-0 flex-1 rounded-xl border border-transparent bg-transparent px-2 text-lg font-semibold outline-none transition focus:border-[var(--color-border)] focus:bg-[var(--color-surface)]"
        />
        <select
          value={prompt.folder_id ?? ""}
          onChange={(e) => moveFolder(e.target.value)}
          className="h-9 rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-2 text-xs"
          title="Pasta"
        >
          <option value="">Sem pasta</option>
          {folders.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
        <button
          onClick={openHistory}
          title="Histórico de versões"
          aria-label="Histórico de versões"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--color-muted)] transition hover:bg-[var(--color-surface-2)]"
        >
          <History className="h-4 w-4" />
        </button>
        <button
          onClick={remove}
          title="Excluir prompt"
          aria-label="Excluir prompt"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--color-muted)] transition hover:bg-[var(--color-danger)]/10 hover:text-[var(--color-danger)]"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder={"Escreve a estrutura do prompt aqui.\n\nUse variáveis entre colchetes: [NOME_DO_PRODUTO], [PUBLICO_ALVO]..."}
        className="min-h-[45dvh] w-full resize-y rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3.5 font-mono text-[13px] leading-relaxed outline-none transition focus:border-[var(--color-primary)]"
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={save} disabled={saving || !dirty}>
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Check className="h-4 w-4" />
          )}
          Salvar
        </Button>
        <Button variant="ghost" onClick={() => setUsing(true)} disabled={!content.trim()}>
          <Wand2 className="h-4 w-4" />
          Usar prompt
        </Button>
        {variables.length > 0 && (
          <span className="flex flex-wrap items-center gap-1.5 text-xs text-[var(--color-muted-2)]">
            Variáveis:
            {variables.map((v) => (
              <code
                key={v}
                className="rounded bg-[var(--color-surface-2)] px-1.5 py-0.5 text-[11px] text-[var(--color-primary)]"
              >
                [{v}]
              </code>
            ))}
          </span>
        )}
      </div>

      {using && (
        <UseModal
          content={content}
          variables={variables}
          onClose={() => setUsing(false)}
        />
      )}

      <Drawer
        open={history !== null}
        onClose={() => setHistory(null)}
        title={`Histórico de versões (${history?.length ?? 0})`}
        size="md"
      >
        <div className="space-y-2">
          {history?.map((v) => (
            <div
              key={v.id}
              className="rounded-xl border border-[var(--color-border)] p-3"
            >
              <div className="flex items-center justify-between">
                <p className="text-xs text-[var(--color-muted)]">
                  {new Date(v.created_at).toLocaleString("pt-BR", {
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                  {v.author && ` · ${v.author.name.split(" ")[0]}`}
                </p>
                <button
                  onClick={() => restore(v.id)}
                  className="text-xs font-medium text-[var(--color-primary)] hover:underline"
                >
                  Restaurar
                </button>
              </div>
              <p className="mt-1.5 line-clamp-3 whitespace-pre-wrap font-mono text-[11px] text-[var(--color-muted)]">
                {v.content}
              </p>
            </div>
          ))}
          {!history?.length && (
            <p className="py-8 text-center text-sm text-[var(--color-muted-2)]">
              Sem versões anteriores — elas aparecem quando você salva
              mudanças no conteúdo.
            </p>
          )}
        </div>
      </Drawer>
    </div>
  );
}

function UseModal({
  content,
  variables,
  onClose,
}: {
  content: string;
  variables: string[];
  onClose: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const result = useMemo(() => {
    let out = content;
    for (const v of variables)
      out = out.split(`[${v}]`).join(values[v]?.trim() || `[${v}]`);
    return out;
  }, [content, variables, values]);

  async function copy() {
    await navigator.clipboard.writeText(result);
    toast("Prompt copiado — cola no seu LLM favorito.");
    onClose();
  }

  return (
    <Dialog open onClose={onClose} title="Preencher variáveis" size="lg">
      {variables.length ? (
        <div className="space-y-2.5">
          {variables.map((v) => (
            <label key={v} className="block">
              <span className="mb-1 block text-xs font-medium text-[var(--color-muted)]">
                {v.replace(/_/g, " ")}
              </span>
              <input
                value={values[v] ?? ""}
                onChange={(e) => setValues({ ...values, [v]: e.target.value })}
                className="h-10 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-sm outline-none transition focus:border-[var(--color-primary)] focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
              />
            </label>
          ))}
        </div>
      ) : (
        <p className="text-sm text-[var(--color-muted)]">
          Esse prompt não tem variáveis — é só copiar.
        </p>
      )}
      <div className="mt-3 max-h-40 overflow-y-auto rounded-xl bg-[var(--color-surface-2)] p-3">
        <p className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-[var(--color-muted)]">
          {result}
        </p>
      </div>
      <Button className="mt-4 w-full" onClick={copy}>
        <Copy className="h-4 w-4" />
        Copiar prompt pronto
      </Button>
    </Dialog>
  );
}
