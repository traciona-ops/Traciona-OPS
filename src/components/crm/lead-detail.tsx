"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Phone,
  Mail,
  Instagram,
  Building2,
  Pencil,
  Check,
  X,
  Plus,
  Sparkles,
  MessageSquare,
  ArrowRightLeft,
  Loader2,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { currencyBRL, formatPhone, readableInk } from "@/lib/utils/ui";
import { ymdBR } from "@/lib/utils/dates";
import { useRole } from "@/components/context/role-context";
import { can } from "@/lib/permissions";
import {
  TaskTypeBadge,
  TaskTypeSelect,
  DEFAULT_TASK_TYPE,
} from "@/components/crm/task-type";
import {
  addNote,
  addTag,
  removeTag,
  transferLead,
  updateLead,
  createTask,
  toggleTask,
  deleteTask,
  deleteLead,
} from "@/app/(dashboard)/crm/actions";
import { analyzeLead } from "@/app/(dashboard)/crm/ai-actions";
import { type Lead, type LeadNote, type LeadTag, type LeadTask, type LeadTransfer, type PipelineStage, type Profile, type TaskCategory } from "@/lib/types";
import { SOURCE_LABEL } from "@/lib/data/labels";
import { ListChecks, Trash2 } from "lucide-react";

const TAG_COLORS = ["#1d6fff", "#00d4ff", "#00e5a0", "#fbbf24", "#ff5c5c", "#f472b6"];

export function LeadDetail({
  lead,
  stages,
  notes,
  transfers,
  team,
  tasks,
  currentUserId,
}: {
  lead: Lead & { tags: LeadTag[]; owner: Profile | null };
  stages: PipelineStage[];
  notes: (LeadNote & { author?: { name: string } })[];
  transfers: (LeadTransfer & { from?: { name: string }; to?: { name: string } })[];
  team: Profile[];
  tasks: (LeadTask & { assignee?: { name: string } })[];
  currentUserId: string;
}) {
  const router = useRouter();
  const role = useRole();
  const [editing, setEditing] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: lead.name,
    phone: lead.phone ?? "",
    email: lead.email ?? "",
    company: lead.company ?? "",
    instagram: lead.instagram ?? "",
    value: String(lead.value ?? 0),
  });

  const [note, setNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [newTag, setNewTag] = useState("");
  const [showTransfer, setShowTransfer] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function removeLead() {
    if (
      !confirm(
        `Excluir o card "${lead.name}" do funil?\nSe houver conversa no WhatsApp, o contato continua no OPS Chat.`
      )
    )
      return;
    setDeleting(true);
    const r = await deleteLead(lead.id);
    if (r && "error" in r) {
      setDeleting(false);
      alert(`Não foi possível excluir: ${r.error}`);
      return;
    }
    if (r && "detached" in r && r.detached) {
      toast("Card removido — o contato continua no OPS Chat.");
    }
    router.push("/crm");
    router.refresh();
  }

  async function saveDetails() {
    setSaving(true);
    await updateLead(lead.id, {
      name: form.name,
      phone: form.phone || null,
      email: form.email || null,
      company: form.company || null,
      instagram: form.instagram || null,
      value: Number(form.value) || 0,
    });
    setSaving(false);
    setEditing(false);
    router.refresh();
  }

  async function changeStage(stageId: string) {
    await updateLead(lead.id, { stage_id: stageId });
    router.refresh();
  }

  async function submitNote() {
    if (!note.trim()) return;
    setSavingNote(true);
    await addNote(lead.id, note.trim());
    setNote("");
    setSavingNote(false);
    router.refresh();
  }

  async function submitTag() {
    if (!newTag.trim()) return;
    const color = TAG_COLORS[lead.tags.length % TAG_COLORS.length];
    await addTag(lead.id, newTag.trim(), color);
    setNewTag("");
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-5xl p-6">
      <Link
        href="/crm"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-[var(--color-muted)] hover:text-[var(--color-foreground)]"
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar ao pipeline
      </Link>

      {/* Stage selector */}
      <div className="mb-5 flex flex-wrap items-center gap-1.5">
        {stages.map((s) => {
          const active = s.id === lead.stage_id;
          return (
            <button
              key={s.id}
              onClick={() => !active && changeStage(s.id)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                active
                  ? ""
                  : "bg-[var(--color-surface-2)] text-[var(--color-muted)] hover:text-[var(--color-foreground)]"
              }`}
              style={
                active
                  ? { backgroundColor: s.color, color: readableInk(s.color) }
                  : undefined
              }
            >
              {s.name}
            </button>
          );
        })}
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Main column */}
        <div className="space-y-5 lg:col-span-2">
          {/* Contact card */}
          <div className="card p-5">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Avatar name={lead.name} src={lead.avatar_url} size={44} />
                <div>
                  <h2 className="text-lg font-semibold">
                    {lead.name}
                    {lead.code != null && (
                      <span
                        className="ml-2 text-sm font-normal tabular-nums text-[var(--color-muted-2)]"
                        title="Código do negócio — busque por ele no Ctrl+K"
                      >
                        #{lead.code}
                      </span>
                    )}
                  </h2>
                  <span className="rounded bg-[var(--color-surface-2)] px-1.5 py-0.5 text-[11px] text-[var(--color-muted)]">
                    {SOURCE_LABEL[lead.source]}
                  </span>
                </div>
              </div>
              {!editing ? (
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
                    <Pencil className="h-3.5 w-3.5" />
                    Editar
                  </Button>
                  {can.deleteLead(role) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={removeLead}
                      disabled={deleting}
                      className="text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10"
                      aria-label="Excluir lead"
                      title="Excluir lead"
                    >
                      {deleting ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  )}
                </div>
              ) : (
                <div className="flex gap-1">
                  <Button size="sm" onClick={saveDetails} disabled={saving}>
                    {saving ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Check className="h-3.5 w-3.5" />
                    )}
                    Salvar
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditing(false)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </div>

            {editing ? (
              <div className="grid grid-cols-2 gap-3">
                <LabeledInput label="Nome" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
                <LabeledInput label="WhatsApp" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
                <LabeledInput label="E-mail" value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
                <LabeledInput label="Empresa" value={form.company} onChange={(v) => setForm({ ...form, company: v })} />
                <LabeledInput label="Instagram" value={form.instagram} onChange={(v) => setForm({ ...form, instagram: v })} />
                <LabeledInput label="Valor (R$)" value={form.value} onChange={(v) => setForm({ ...form, value: v })} type="number" />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 text-sm">
                <InfoRow icon={Phone} value={lead.phone ? formatPhone(lead.phone) : "—"} />
                <InfoRow icon={Mail} value={lead.email ?? "—"} />
                <InfoRow icon={Building2} value={lead.company ?? "—"} />
                <InfoRow icon={Instagram} value={lead.instagram ?? "—"} />
              </div>
            )}

            {lead.value > 0 && !editing && (
              <p className="mt-3 text-sm">
                <span className="text-[var(--color-muted)]">Valor: </span>
                <span className="font-semibold text-[var(--color-success)]">
                  {currencyBRL(lead.value)}
                </span>
              </p>
            )}
          </div>

          {/* IA: score + dor + abordagem, gerados da conversa do WhatsApp */}
          <div className="card p-5">
            <div className="mb-2 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-[var(--color-primary)]" />
              <h3 className="text-sm font-semibold">Análise IA</h3>
              {lead.ai_score != null && (
                <span
                  className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                  style={{
                    backgroundColor:
                      lead.ai_score >= 70
                        ? "color-mix(in srgb, var(--color-success) 15%, transparent)"
                        : lead.ai_score >= 40
                        ? "color-mix(in srgb, #f59e0b 15%, transparent)"
                        : "color-mix(in srgb, var(--color-danger) 15%, transparent)",
                    color:
                      lead.ai_score >= 70
                        ? "var(--color-success)"
                        : lead.ai_score >= 40
                        ? "#f59e0b"
                        : "var(--color-danger)",
                  }}
                >
                  {lead.ai_score}/100
                </span>
              )}
              <button
                onClick={async () => {
                  setAiBusy(true);
                  setAiError(null);
                  const r = await analyzeLead(lead.id);
                  setAiBusy(false);
                  if (r && "error" in r && r.error) setAiError(r.error);
                  else router.refresh();
                }}
                disabled={aiBusy}
                className="ml-auto inline-flex items-center gap-1 rounded-lg border border-[var(--color-border-strong)] px-2 py-1 text-xs text-[var(--color-muted)] hover:text-[var(--color-foreground)] disabled:opacity-50"
              >
                {aiBusy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                {lead.pain_summary ? "Reanalisar" : "Analisar com IA"}
              </button>
            </div>
            {aiError && (
              <p className="mb-2 rounded-lg bg-[var(--color-danger)]/10 px-3 py-2 text-xs text-[var(--color-danger)]">
                {aiError}
              </p>
            )}
            {lead.pain_summary ? (
              <div className="space-y-2 text-sm">
                <p className="text-[var(--color-muted)]">{lead.pain_summary}</p>
                {lead.approach_suggestion && (
                  <p className="rounded-lg bg-[var(--color-surface-2)] p-3">
                    {lead.approach_suggestion}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm text-[var(--color-muted-2)]">
                Clique em &ldquo;Analisar com IA&rdquo; pra gerar o score do lead,
                o resumo da dor e a abordagem sugerida a partir da conversa.
              </p>
            )}
          </div>

          {/* Tasks */}
          <TaskSection
            leadId={lead.id}
            tasks={tasks}
            team={team}
            currentUserId={currentUserId}
          />

          {/* Notes */}
          <div className="card p-5">
            <h3 className="mb-3 text-sm font-semibold">Anotações</h3>
            <div className="mb-4 flex gap-2">
              <Textarea
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Adicionar anotação..."
              />
              <Button onClick={submitNote} disabled={savingNote || !note.trim()}>
                {savingNote ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar"}
              </Button>
            </div>
            <div className="space-y-3">
              {notes.length === 0 && (
                <p className="text-sm text-[var(--color-muted-2)]">
                  Nenhuma anotação ainda.
                </p>
              )}
              {notes.map((n) => (
                <div key={n.id} className="rounded-lg bg-[var(--color-surface-2)] p-3">
                  <p className="text-sm">{n.content}</p>
                  <p className="mt-1.5 text-[11px] text-[var(--color-muted-2)]">
                    {n.author?.name ?? "—"} ·{" "}
                    {new Date(n.created_at).toLocaleString("pt-BR")}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-5">
          {/* Owner / transfer */}
          <div className="card p-5">
            <h3 className="mb-3 text-sm font-semibold">Responsável</h3>
            {lead.owner ? (
              <div className="flex items-center gap-2">
                <Avatar name={lead.owner.name} src={lead.owner.avatar_url} size={32} />
                <span className="text-sm">{lead.owner.name}</span>
              </div>
            ) : (
              <p className="text-sm text-[var(--color-muted-2)]">Sem responsável</p>
            )}
            {can.transferLead(role) && (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-3 w-full"
                  onClick={() => setShowTransfer((s) => !s)}
                >
                  <ArrowRightLeft className="h-3.5 w-3.5" />
                  Transferir lead
                </Button>
                {showTransfer && (
                  <TransferForm
                    leadId={lead.id}
                    team={team}
                    onDone={() => {
                      setShowTransfer(false);
                      router.refresh();
                    }}
                  />
                )}
              </>
            )}
          </div>

          {/* Tags */}
          <div className="card p-5">
            <h3 className="mb-3 text-sm font-semibold">Tags</h3>
            <div className="mb-3 flex flex-wrap gap-1.5">
              {lead.tags.length === 0 && (
                <p className="text-sm text-[var(--color-muted-2)]">Sem tags</p>
              )}
              {lead.tags.map((t) => (
                <span
                  key={t.id}
                  className="group inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium"
                  style={{ backgroundColor: `${t.color}22`, color: t.color }}
                >
                  {t.tag}
                  <button
                    onClick={async () => {
                      await removeTag(t.id, lead.id);
                      router.refresh();
                    }}
                    className="opacity-50 hover:opacity-100"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                placeholder="Nova tag"
                onKeyDown={(e) => e.key === "Enter" && submitTag()}
                className="h-8 text-xs"
              />
              <Button size="sm" variant="secondary" onClick={submitTag}>
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {/* WhatsApp */}
          <div className="card p-5">
            <div className="mb-3 flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-[var(--color-success)]" />
              <h3 className="text-sm font-semibold">WhatsApp</h3>
            </div>
            {lead.phone ? (
              <Link
                href={`/crm/mensagens?lead=${lead.id}`}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--color-success)]/15 px-3 py-2 text-sm font-medium text-[var(--color-success)] hover:bg-[var(--color-success)]/25"
              >
                <MessageSquare className="h-4 w-4" />
                Abrir conversa
              </Link>
            ) : (
              <p className="text-sm text-[var(--color-muted-2)]">
                Lead sem telefone — adicione um número para conversar.
              </p>
            )}
          </div>

          {/* History */}
          <div className="card p-5">
            <h3 className="mb-3 text-sm font-semibold">Histórico de transferências</h3>
            {transfers.length === 0 ? (
              <p className="text-sm text-[var(--color-muted-2)]">Nenhuma.</p>
            ) : (
              <div className="space-y-2">
                {transfers.map((t) => (
                  <div key={t.id} className="text-xs text-[var(--color-muted)]">
                    <span className="text-[var(--color-foreground)]">
                      {t.from?.name ?? "—"}
                    </span>{" "}
                    →{" "}
                    <span className="text-[var(--color-foreground)]">
                      {t.to?.name ?? "—"}
                    </span>
                    {t.reason && <span> · {t.reason}</span>}
                    <span className="block text-[11px] text-[var(--color-muted-2)]">
                      {new Date(t.created_at).toLocaleString("pt-BR")}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function TaskSection({
  leadId,
  tasks,
  team,
  currentUserId,
}: {
  leadId: string;
  tasks: (LeadTask & { assignee?: { name: string } })[];
  team: Profile[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<TaskCategory>(DEFAULT_TASK_TYPE);
  const [assignee, setAssignee] = useState(currentUserId);
  const [due, setDue] = useState("");
  const [saving, setSaving] = useState(false);

  const today = ymdBR();
  const open = tasks.filter((t) => !t.done);
  const done = tasks.filter((t) => t.done);

  async function add() {
    if (!title.trim()) return;
    setSaving(true);
    await createTask({
      leadId,
      title: title.trim(),
      category,
      assigneeId: assignee || null,
      dueDate: due || null,
    });
    setTitle("");
    setDue("");
    setSaving(false);
    router.refresh();
  }

  function Row({ t }: { t: LeadTask & { assignee?: { name: string } } }) {
    const overdue = !t.done && t.due_date && t.due_date < today;
    return (
      <div className="flex items-center gap-2.5 rounded-lg bg-[var(--color-surface-2)] px-3 py-2">
        <button
          onClick={async () => {
            await toggleTask(t.id, leadId, !t.done);
            router.refresh();
          }}
          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
            t.done
              ? "border-[var(--color-success)] bg-[var(--color-success)] text-[var(--color-on-accent)]"
              : "border-[var(--color-border-strong)]"
          }`}
        >
          {t.done && <Check className="h-3 w-3" />}
        </button>
        <div className="min-w-0 flex-1">
          <p
            className={`truncate text-sm ${
              t.done ? "text-[var(--color-muted-2)] line-through" : ""
            }`}
          >
            {t.title}
          </p>
          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-[var(--color-muted)]">
            <TaskTypeBadge value={t.category} />
            {t.assignee?.name && <span>{t.assignee.name}</span>}
            {t.due_date && (
              <span className={overdue ? "text-[var(--color-danger)]" : ""}>
                {overdue ? "venceu " : "prazo "}
                {new Date(t.due_date + "T00:00:00").toLocaleDateString("pt-BR")}
              </span>
            )}
          </div>
        </div>
        <button
          onClick={async () => {
            await deleteTask(t.id, leadId);
            router.refresh();
          }}
          className="text-[var(--color-muted-2)] hover:text-[var(--color-danger)]"
          aria-label="Excluir tarefa"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="card p-5">
      <div className="mb-3 flex items-center gap-2">
        <ListChecks className="h-4 w-4 text-[var(--color-primary)]" />
        <h3 className="text-sm font-semibold">Tarefas</h3>
        {open.length > 0 && (
          <span className="rounded-full bg-[var(--color-surface-2)] px-1.5 text-xs text-[var(--color-muted)]">
            {open.length} aberta(s)
          </span>
        )}
      </div>

      <div className="mb-4 space-y-2">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Nova tarefa..."
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
        <div className="flex gap-2">
          <TaskTypeSelect value={category} onChange={setCategory} className="h-10 flex-1" />
          <select
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
            className="h-10 flex-1 rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-2 text-xs"
          >
            <option value="">Sem responsável</option>
            {team.map((m) => (
              <option key={m.id} value={m.id}>
                {m.id === currentUserId ? `${m.name} (eu)` : m.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex gap-2">
          <Input
            type="date"
            value={due}
            onChange={(e) => setDue(e.target.value)}
            className="h-10 flex-1 text-xs"
          />
          <Button size="sm" onClick={add} disabled={saving || !title.trim()}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Add"}
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        {tasks.length === 0 && (
          <p className="text-sm text-[var(--color-muted-2)]">
            Nenhuma tarefa ainda.
          </p>
        )}
        {open.map((t) => (
          <Row key={t.id} t={t} />
        ))}
        {done.map((t) => (
          <Row key={t.id} t={t} />
        ))}
      </div>
    </div>
  );
}

function TransferForm({
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

function InfoRow({
  icon: Icon,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2 text-[var(--color-muted)]">
      <Icon className="h-4 w-4 shrink-0" />
      <span className="truncate text-[var(--color-foreground)]">{value}</span>
    </div>
  );
}

function LabeledInput({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs text-[var(--color-muted)]">{label}</label>
      <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
