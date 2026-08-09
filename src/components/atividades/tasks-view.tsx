"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Plus,
  Check,
  Trash2,
  Loader2,
  ListChecks,
  ExternalLink,
  Flag,
  List,
  Columns3,
  Search,
  CheckCircle2,
  Clock3,
  RotateCw,
  CalendarX2,
  type LucideIcon,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import {
  createTask,
  toggleTask,
  deleteTask,
  updateTask,
} from "@/app/(dashboard)/crm/actions";
import {
  TaskTypeBadge,
  TaskTypeSelect,
  DEFAULT_TASK_TYPE,
} from "@/components/crm/task-type";
import { type LeadTask, type Profile, type TaskCategory, type TaskStatus, type TaskPriority } from "@/lib/types";
import { TASK_STATUS, TASK_PRIORITY } from "@/lib/data/labels";
import { ymdBR } from "@/lib/utils/dates";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragEndEvent,
} from "@dnd-kit/core";

export type ViewTask = LeadTask & {
  lead?: { id: string; name: string } | null;
  assignee?: { id: string; name: string; avatar_url: string | null } | null;
};

// Filtro único: cards de status e chips rápidos apontam pro mesmo estado.
type TaskFilter =
  | "todas"
  | "concluidas"
  | "pendentes"
  | "andamento"
  | "atrasadas"
  | "minhas";

// SEMPRE no fuso BR: toISOString() é UTC e, depois das 21h, empurrava a
// tarefa de hoje pra "Atrasadas" e a de amanhã pra "Hoje".
const ymd = (d: Date) => ymdBR(d);

export function TasksView({
  tasks,
  team,
  leads,
  currentUserId,
}: {
  tasks: ViewTask[];
  team: Profile[];
  leads: { id: string; name: string }[];
  currentUserId: string;
  userName: string;
}) {
  const [filter, setFilter] = useState<TaskFilter>("minhas");
  const [q, setQ] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [view, setView] = useState<"lista" | "quadro">("lista");

  const today = ymd(new Date());

  const overdueList = tasks.filter(
    (t) => !t.done && t.due_date && t.due_date < today
  );
  const avgDelayDays = overdueList.length
    ? Math.round(
        overdueList.reduce(
          (a, t) =>
            a +
            (new Date(`${today}T00:00:00`).getTime() -
              new Date(`${t.due_date}T00:00:00`).getTime()) /
              864e5,
          0
        ) / overdueList.length
      )
    : 0;

  const counts = {
    todas: tasks.length,
    concluidas: tasks.filter((t) => t.done).length,
    pendentes: tasks.filter(
      (t) => !t.done && (t.status ?? "a_fazer") === "a_fazer"
    ).length,
    andamento: tasks.filter((t) => !t.done && t.status === "em_andamento")
      .length,
    atrasadas: overdueList.length,
    minhas: tasks.filter((t) => !t.done && t.assignee_id === currentUserId)
      .length,
  };

  function matchesFilter(t: ViewTask): boolean {
    switch (filter) {
      case "concluidas":
        return t.done;
      case "pendentes":
        return !t.done && (t.status ?? "a_fazer") === "a_fazer";
      case "andamento":
        return !t.done && t.status === "em_andamento";
      case "atrasadas":
        return !t.done && !!t.due_date && t.due_date! < today;
      case "minhas":
        return !t.done && t.assignee_id === currentUserId;
      default:
        return true;
    }
  }

  const query = q.trim().toLowerCase();
  const matchesSearch = (t: ViewTask) =>
    !query ||
    `${t.title} ${t.lead?.name ?? ""} ${t.assignee?.name ?? ""}`
      .toLowerCase()
      .includes(query);

  const visible = useMemo(() => {
    const list = tasks.filter((t) => matchesFilter(t) && matchesSearch(t));
    if (filter === "concluidas")
      return list.sort((a, b) =>
        (b.completed_at ?? "").localeCompare(a.completed_at ?? "")
      );
    // abertas primeiro; dentro delas, prazo mais próximo em cima
    return list.sort(
      (a, b) =>
        Number(a.done) - Number(b.done) ||
        (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999")
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, filter, query, today]);

  const cards: {
    key: TaskFilter;
    label: string;
    count: number;
    sub: string;
    icon: LucideIcon;
    color: string;
  }[] = [
    {
      key: "todas",
      label: "Todas",
      count: counts.todas,
      sub: "Todas as tarefas",
      icon: List,
      color: "var(--color-muted)",
    },
    {
      key: "concluidas",
      label: "Concluídas",
      count: counts.concluidas,
      sub: "Tarefas finalizadas",
      icon: CheckCircle2,
      color: "var(--color-success)",
    },
    {
      key: "pendentes",
      label: "Pendentes",
      count: counts.pendentes,
      sub: "Ainda não iniciadas",
      icon: Clock3,
      color: "var(--color-warning)",
    },
    {
      key: "andamento",
      label: "Em andamento",
      count: counts.andamento,
      sub: "Sendo executadas",
      icon: RotateCw,
      color: "var(--color-primary)",
    },
    {
      key: "atrasadas",
      label: "Atrasadas",
      count: counts.atrasadas,
      sub:
        counts.atrasadas > 0
          ? `média de ${avgDelayDays} dia${avgDelayDays === 1 ? "" : "s"} de atraso`
          : "Nada atrasado",
      icon: CalendarX2,
      color: "var(--color-danger)",
    },
  ];

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-6xl p-6">
        {/* Cards de status (modelo Groner) — clicáveis, filtram a lista */}
        <div className="mb-5 grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-5">
          {cards.map((c) => {
            const Icon = c.icon;
            const active = filter === c.key;
            return (
              <button
                key={c.key}
                onClick={() => setFilter(c.key)}
                className={`card p-3.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] ${
                  active
                    ? "border-[var(--color-primary)] ring-1 ring-[var(--color-primary)]/30"
                    : "card-hover"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className="text-[11px] font-bold uppercase tracking-wider"
                    style={{ color: c.color }}
                  >
                    {c.label}
                  </span>
                  <span
                    className="flex h-7 w-7 items-center justify-center rounded-lg"
                    style={{ backgroundColor: `color-mix(in srgb, ${c.color} 12%, transparent)` }}
                  >
                    <Icon className="h-3.5 w-3.5" style={{ color: c.color }} />
                  </span>
                </div>
                <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">
                  {c.count}
                </p>
                <p className="mt-0.5 truncate text-[11px] text-[var(--color-muted-2)]">
                  {c.sub}
                </p>
              </button>
            );
          })}
        </div>

        {/* Toolbar: no mobile empilha em 3 linhas limpas; no desktop, 1 linha */}
        <div className="mb-4 flex flex-wrap items-center gap-2.5">
          <h1 className="order-1 text-xl font-bold tracking-tight">
            Tarefas{" "}
            <span className="text-sm font-medium text-[var(--color-muted-2)]">
              ({visible.length})
            </span>
          </h1>

          <div className="order-3 relative w-full min-w-0 sm:order-2 sm:w-auto sm:min-w-40 sm:flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-muted-2)]" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Pesquisar"
              className="h-10 w-full rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface)] pl-9 pr-3 text-sm placeholder:text-[var(--color-muted-2)] focus:border-[var(--color-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
            />
          </div>

          <div className="order-4 flex max-w-full overflow-x-auto rounded-xl bg-[var(--color-surface-2)] p-0.5 text-xs font-medium sm:order-3">
            {(
              [
                ["todas", "Todas"],
                ["pendentes", "Pendentes"],
                ["atrasadas", "Atrasadas"],
                ["minhas", "Minhas"],
              ] as [TaskFilter, string][]
            ).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setFilter(k)}
                className={`rounded-lg px-3 py-1.5 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] ${
                  filter === k
                    ? "bg-[var(--color-surface)] font-semibold text-[var(--color-foreground)] shadow-sm"
                    : "text-[var(--color-muted)] hover:text-[var(--color-foreground)]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="order-5 flex rounded-xl bg-[var(--color-surface-2)] p-0.5 sm:order-4">
            {(
              [
                ["lista", "Lista", List],
                ["quadro", "Quadro", Columns3],
              ] as const
            ).map(([k, label, Icon]) => (
              <button
                key={k}
                onClick={() => setView(k)}
                title={label}
                aria-label={label}
                className={`flex min-h-9 min-w-9 items-center justify-center rounded-lg px-2.5 py-1.5 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] ${
                  view === k
                    ? "bg-[var(--color-surface)] text-[var(--color-primary)] shadow-sm"
                    : "text-[var(--color-muted)] hover:text-[var(--color-foreground)]"
                }`}
              >
                <Icon className="h-4 w-4" />
              </button>
            ))}
          </div>

          <Button
            onClick={() => setNewOpen(true)}
            className="order-2 ml-auto sm:order-6 sm:ml-0"
          >
            <Plus className="h-4 w-4" />
            Nova tarefa
          </Button>
        </div>

        {view === "quadro" ? (
          <TaskBoard
            tasks={tasks.filter(
              (t) =>
                matchesSearch(t) &&
                (filter !== "minhas" || t.assignee_id === currentUserId)
            )}
            today={today}
          />
        ) : visible.length === 0 ? (
          <div className="card flex flex-col items-center p-12 text-center">
            <ListChecks className="mb-3 h-8 w-8 text-[var(--color-muted-2)]" />
            <p className="text-sm font-medium">Tudo limpo aqui!</p>
            <p className="mt-1 text-sm text-[var(--color-muted)]">
              Nenhuma tarefa nesse filtro no momento.
            </p>
            <button
              onClick={() => setNewOpen(true)}
              className="mt-4 inline-flex min-h-9 items-center rounded-[var(--radius-control)] px-2 text-sm font-semibold text-[var(--color-primary)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
            >
              + Criar nova tarefa agora
            </button>
          </div>
        ) : (
          <TaskTable tasks={visible} team={team} today={today} />
        )}
      </div>

      {newOpen && (
        <NewTask
          team={team}
          leads={leads}
          currentUserId={currentUserId}
          onClose={() => setNewOpen(false)}
        />
      )}
    </div>
  );
}

const PRIORITY_ORDER: TaskPriority[] = ["urgente", "alta", "normal", "baixa"];

/** Bandeirinha de prioridade — clique cicla urgente → alta → normal → baixa. */
function PriorityFlag({
  task,
  size = "h-3.5 w-3.5",
}: {
  task: ViewTask;
  size?: string;
}) {
  const router = useRouter();
  const p = (task.priority ?? "normal") as TaskPriority;
  async function cycle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const next =
      PRIORITY_ORDER[(PRIORITY_ORDER.indexOf(p) + 1) % PRIORITY_ORDER.length];
    await updateTask(task.id, { priority: next });
    router.refresh();
  }
  return (
    <button
      onClick={cycle}
      title={`Prioridade: ${TASK_PRIORITY[p].label} (clique pra mudar)`}
      aria-label={`Prioridade ${TASK_PRIORITY[p].label}`}
      className="flex min-h-9 min-w-9 shrink-0 items-center justify-center rounded-[var(--radius-control)] transition hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
    >
      <Flag
        className={size}
        style={{ color: TASK_PRIORITY[p].color }}
        fill={p === "urgente" || p === "alta" ? TASK_PRIORITY[p].color : "none"}
      />
    </button>
  );
}

// ===================== Lista em tabela (modelo Groner) =====================

function TaskTable({
  tasks,
  team,
  today,
}: {
  tasks: ViewTask[];
  team: Profile[];
  today: string;
}) {
  return (
    <div className="card overflow-x-auto p-0">
      <table className="w-full min-w-[860px] text-sm">
        <thead>
          <tr className="border-b border-[var(--color-border)] text-left text-[11px] uppercase tracking-wider text-[var(--color-muted-2)]">
            <th scope="col" className="px-4 py-2.5 font-semibold">Status</th>
            <th scope="col" className="px-3 py-2.5 font-semibold">Tarefa</th>
            <th scope="col" className="px-3 py-2.5 font-semibold">Prior.</th>
            <th scope="col" className="px-3 py-2.5 font-semibold">Tipo</th>
            <th scope="col" className="px-3 py-2.5 font-semibold">Responsável</th>
            <th scope="col" className="px-3 py-2.5 font-semibold">Prazo</th>
            <th scope="col" className="px-3 py-2.5 font-semibold">Concluída em</th>
            <th scope="col" className="px-3 py-2.5" />
          </tr>
        </thead>
        <tbody>
          {tasks.map((t) => (
            <TaskTableRow key={t.id} task={t} team={team} today={today} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TaskTableRow({
  task,
  team,
  today,
}: {
  task: ViewTask;
  team: Profile[];
  today: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const overdue = !task.done && task.due_date && task.due_date < today;
  const status = (task.status ?? "a_fazer") as TaskStatus;
  const statusMeta = TASK_STATUS[status];

  async function patch(p: Parameters<typeof updateTask>[1]) {
    setBusy(true);
    await updateTask(task.id, p);
    setBusy(false);
    router.refresh();
  }
  async function toggle() {
    setBusy(true);
    await toggleTask(task.id, task.lead_id, !task.done);
    setBusy(false);
    router.refresh();
  }
  async function remove() {
    setBusy(true);
    await deleteTask(task.id, task.lead_id);
    setBusy(false);
    router.refresh();
  }

  const cellSelect =
    "h-8 rounded-lg border border-transparent bg-transparent px-1.5 text-xs hover:border-[var(--color-border-strong)] focus:border-[var(--color-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]";

  return (
    <tr className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-surface-2)]/50">
      {/* Status como pill editável */}
      <td className="px-4 py-2">
        <select
          value={status}
          onChange={(e) => patch({ status: e.target.value as TaskStatus })}
          className="h-7 cursor-pointer rounded-full border-0 px-2.5 text-[11px] font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
          style={{
            backgroundColor: `color-mix(in srgb, ${statusMeta.color} 14%, transparent)`,
            color: statusMeta.color,
          }}
        >
          {(Object.keys(TASK_STATUS) as TaskStatus[]).map((s) => (
            <option key={s} value={s}>
              {TASK_STATUS[s].label}
            </option>
          ))}
        </select>
      </td>

      {/* Tarefa: check + título + negócio */}
      <td className="max-w-64 px-3 py-2">
        <div className="flex items-center gap-2.5">
          <button
            onClick={toggle}
            disabled={busy}
            aria-label={task.done ? "Reabrir tarefa" : "Concluir tarefa"}
            className={`flex min-h-9 min-w-9 shrink-0 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]`}
          >
            <span
              className={`flex h-4.5 w-4.5 items-center justify-center rounded-full border ${
                task.done
                  ? "border-[var(--color-success)] bg-[var(--color-success)] text-[var(--color-on-accent)]"
                  : "border-[var(--color-border-strong)] hover:border-[var(--color-success)]"
              }`}
            >
              {task.done && <Check className="h-3 w-3" />}
            </span>
          </button>
          <div className="min-w-0">
            <p
              className={`truncate text-sm ${
                task.done
                  ? "text-[var(--color-muted-2)] line-through"
                  : "font-medium"
              }`}
            >
              {task.title}
            </p>
            {task.lead && (
              <Link
                href={`/crm/leads/${task.lead.id}`}
                className="inline-flex max-w-full items-center gap-0.5 truncate text-[11px] text-[var(--color-muted)] hover:text-[var(--color-primary)]"
              >
                <ExternalLink className="h-3 w-3 shrink-0" />
                <span className="truncate">{task.lead.name}</span>
              </Link>
            )}
          </div>
        </div>
      </td>

      <td className="px-3 py-2">
        <PriorityFlag task={task} size="h-4 w-4" />
      </td>

      <td className="px-3 py-2">
        <TaskTypeBadge value={task.category} />
      </td>

      {/* Responsável editável */}
      <td className="px-3 py-2">
        <div className="flex items-center gap-1.5">
          {task.assignee?.name && (
            <Avatar
              name={task.assignee.name}
              src={task.assignee.avatar_url}
              size={22}
            />
          )}
          <select
            value={task.assignee_id ?? ""}
            onChange={(e) => patch({ assignee_id: e.target.value || null })}
            className={`${cellSelect} max-w-32`}
          >
            <option value="">Ninguém</option>
            {team.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
      </td>

      {/* Prazo editável */}
      <td className="px-3 py-2">
        <input
          type="date"
          value={task.due_date ?? ""}
          onChange={(e) => patch({ due_date: e.target.value || null })}
          className={`${cellSelect} tabular-nums ${
            overdue ? "font-semibold text-[var(--color-danger)]" : ""
          }`}
        />
      </td>

      <td className="px-3 py-2 text-xs tabular-nums text-[var(--color-muted)]">
        {task.completed_at
          ? new Date(task.completed_at).toLocaleDateString("pt-BR")
          : "–"}
      </td>

      <td className="px-3 py-2 text-right">
        <button
          onClick={remove}
          disabled={busy}
          className="flex min-h-9 min-w-9 items-center justify-center rounded-[var(--radius-control)] text-[var(--color-muted-2)] transition hover:text-[var(--color-danger)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
          aria-label="Excluir tarefa"
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="h-4 w-4" />
          )}
        </button>
      </td>
    </tr>
  );
}

function NewTask({
  team,
  leads,
  currentUserId,
  onClose,
}: {
  team: Profile[];
  leads: { id: string; name: string }[];
  currentUserId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<TaskCategory>(DEFAULT_TASK_TYPE);
  const [assignee, setAssignee] = useState(currentUserId);
  const [leadId, setLeadId] = useState("");
  const [due, setDue] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("normal");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setLoading(true);
    await createTask({
      title: title.trim(),
      category,
      assigneeId: assignee || null,
      leadId: leadId || null,
      dueDate: due || null,
      priority,
    });
    setLoading(false);
    router.refresh();
    onClose();
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Nova tarefa"
      size="md"
      dismissible={!loading}
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="new-task-form" disabled={loading || !title.trim()}>
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Criar tarefa
          </Button>
        </>
      }
    >
      <form id="new-task-form" onSubmit={submit} className="space-y-3">
        <div>
          <label className="mb-1 block text-xs text-[var(--color-muted)]">
            O que precisa ser feito?
          </label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ex: Gravar aula 0.0 para academy"
            required
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tipo">
            <TaskTypeSelect value={category} onChange={setCategory} />
          </Field>
          <Field label="Responsável">
            <select
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
              className="h-10 w-full rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
            >
              <option value="">Ninguém</option>
              {team.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.id === currentUserId ? `${m.name} (eu)` : m.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Vincular a negócio (opcional)">
            <select
              value={leadId}
              onChange={(e) => setLeadId(e.target.value)}
              className="h-10 w-full rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
            >
              <option value="">Nenhum</option>
              {leads.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Prazo">
            <Input
              type="date"
              value={due}
              onChange={(e) => setDue(e.target.value)}
            />
          </Field>
          <Field label="Prioridade">
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as TaskPriority)}
              className="h-10 w-full rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
            >
              {(Object.keys(TASK_PRIORITY) as TaskPriority[]).map((p) => (
                <option key={p} value={p}>
                  {TASK_PRIORITY[p].label}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </form>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs text-[var(--color-muted)]">
        {label}
      </label>
      {children}
    </div>
  );
}

// ===================== Quadro (estilo ClickUp) =====================

const BOARD_COLUMNS: TaskStatus[] = ["a_fazer", "em_andamento", "concluida"];

function TaskBoard({ tasks, today }: { tasks: ViewTask[]; today: string }) {
  const router = useRouter();
  // estado local otimista: o card muda de coluna na hora do drop
  const [items, setItems] = useState<ViewTask[]>(tasks);
  const [syncKey, setSyncKey] = useState("");
  const incoming = JSON.stringify(tasks.map((t) => `${t.id}${t.status}`));
  if (incoming !== syncKey) {
    setSyncKey(incoming);
    setItems(tasks);
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  async function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over) return;
    const status = String(over.id) as TaskStatus;
    if (!BOARD_COLUMNS.includes(status)) return;
    const task = items.find((t) => t.id === active.id);
    if (!task || task.status === status) return;
    setItems((prev) =>
      prev.map((t) =>
        t.id === task.id
          ? { ...t, status, done: status === "concluida" }
          : t
      )
    );
    await updateTask(task.id, { status });
    router.refresh();
  }

  const weight = (p: TaskPriority | null) =>
    PRIORITY_ORDER.indexOf((p ?? "normal") as TaskPriority);

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <div className="grid gap-4 md:grid-cols-3">
        {BOARD_COLUMNS.map((status) => {
          const list = items
            .filter((t) => (t.status ?? "a_fazer") === status)
            .sort(
              (a, b) =>
                weight(a.priority) - weight(b.priority) ||
                (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999")
            );
          return (
            <BoardColumn
              key={status}
              status={status}
              list={list}
              today={today}
            />
          );
        })}
      </div>
    </DndContext>
  );
}

function BoardColumn({
  status,
  list,
  today,
}: {
  status: TaskStatus;
  list: ViewTask[];
  today: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const meta = TASK_STATUS[status];
  return (
    <div
      ref={setNodeRef}
      className={`flex min-h-[300px] flex-col rounded-xl bg-[var(--color-surface)]/60 p-2 transition-colors ${
        isOver ? "ring-2 ring-[var(--color-primary)]/40" : ""
      }`}
    >
      <div className="mb-2 flex items-center gap-2 px-1.5 pt-1">
        <span
          className="h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: meta.color }}
        />
        <span className="text-sm font-semibold">{meta.label}</span>
        <span className="rounded-full bg-[var(--color-surface-2)] px-1.5 text-xs text-[var(--color-muted)]">
          {list.length}
        </span>
      </div>
      <div className="flex-1 space-y-2">
        {list.map((t) => (
          <BoardCard key={t.id} task={t} today={today} />
        ))}
        {list.length === 0 && (
          <p className="px-2 py-6 text-center text-xs text-[var(--color-muted-2)]">
            Arraste tarefas pra cá
          </p>
        )}
      </div>
    </div>
  );
}

function BoardCard({ task, today }: { task: ViewTask; today: string }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: task.id });
  const overdue = !task.done && task.due_date && task.due_date < today;
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={
        transform
          ? { transform: `translate(${transform.x}px, ${transform.y}px)` }
          : undefined
      }
      className={`card cursor-grab p-3 active:cursor-grabbing ${
        isDragging ? "z-50 opacity-80 shadow-xl" : "card-hover"
      }`}
    >
      <div className="flex items-start gap-1.5">
        <PriorityFlag task={task} />
        <p
          className={`min-w-0 flex-1 text-sm leading-snug ${
            task.done
              ? "text-[var(--color-muted-2)] line-through"
              : "font-medium"
          }`}
        >
          {task.title}
        </p>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-[var(--color-muted)]">
        <TaskTypeBadge value={task.category} />
        {task.lead && (
          <Link
            href={`/crm/leads/${task.lead.id}`}
            onClick={(e) => e.stopPropagation()}
            className="inline-flex max-w-32 items-center gap-0.5 truncate hover:text-[var(--color-primary)]"
          >
            <ExternalLink className="h-3 w-3 shrink-0" />
            <span className="truncate">{task.lead.name}</span>
          </Link>
        )}
        {task.due_date && (
          <span className={overdue ? "font-medium text-[var(--color-danger)]" : ""}>
            {new Date(task.due_date + "T00:00:00").toLocaleDateString("pt-BR", {
              day: "2-digit",
              month: "2-digit",
            })}
          </span>
        )}
        {task.assignee?.name && (
          <span className="ml-auto">
            <Avatar
              name={task.assignee.name}
              src={task.assignee.avatar_url}
              size={20}
            />
          </span>
        )}
      </div>
    </div>
  );
}
