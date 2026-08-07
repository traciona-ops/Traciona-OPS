"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Zap,
  Plus,
  Trash2,
  Loader2,
  ArrowRight,
  Clock,
  MessageSquareReply,
  MessageSquareText,
  BellOff,
  LogIn,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import {
  listAutomations,
  createAutomation,
  toggleAutomation,
  deleteAutomation,
} from "@/app/(dashboard)/crm/actions";
import {
  AUTOMATION_TRIGGER,
  AUTOMATION_ACTION,
  type Automation,
  type AutomationTrigger,
  type AutomationAction,
  type Pipeline,
  type PipelineStage,
} from "@/lib/types";

const SELECT_CLASS =
  "h-10 rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-border-strong)] px-2.5 text-sm text-[var(--color-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/40 focus:border-[var(--color-primary)] focus-visible:ring-[var(--color-primary)] transition";

const TRIGGER_ICON: Record<AutomationTrigger, typeof Clock> = {
  stale_days: Clock,
  reply_received: MessageSquareReply,
  no_reply_days: BellOff,
  enter_stage: LogIn,
};

const TRIGGER_ORDER: AutomationTrigger[] = [
  "stale_days",
  "reply_received",
  "no_reply_days",
  "enter_stage",
];

export function AutomationsModal({
  pipeline,
  onClose,
}: {
  pipeline: Pipeline;
  onClose: () => void;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [error, setError] = useState<string | null>(null);

  // form
  const [adding, setAdding] = useState(false);
  const [trigger, setTrigger] = useState<AutomationTrigger>("stale_days");
  const [action, setAction] = useState<AutomationAction>("move_stage");
  const [stageId, setStageId] = useState("");
  const [toStageId, setToStageId] = useState("");
  const [days, setDays] = useState(3);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  // "entrou na etapa" só faz sentido com envio de mensagem
  useEffect(() => {
    if (trigger === "enter_stage" && action === "move_stage") {
      setAction("send_message");
    }
  }, [trigger, action]);

  async function load() {
    setLoading(true);
    const r = await listAutomations(pipeline.id);
    setLoading(false);
    if ("error" in r) {
      setError(r.error);
      return;
    }
    setAutomations(r.automations);
    setStages(r.stages);
    if (r.stages[0] && !stageId) setStageId(r.stages[0].id);
    if (r.stages[1] && !toStageId) setToStageId(r.stages[1].id);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pipeline.id]);

  // Destino nunca pode ser igual ao gatilho (o select de destino filtra a etapa
  // gatilho; sem isso o valor ficaria "preso" numa opção invisível).
  useEffect(() => {
    if (toStageId === stageId) {
      const alt = stages.find((s) => s.id !== stageId);
      if (alt) setToStageId(alt.id);
    }
  }, [stageId, toStageId, stages]);

  const stageName = (id: string | null) =>
    stages.find((s) => s.id === id)?.name ?? "—";

  const needsDays = AUTOMATION_TRIGGER[trigger].needsDays;

  async function save() {
    setError(null);
    setSaving(true);
    const r = await createAutomation({
      pipeline_id: pipeline.id,
      stage_id: stageId,
      action,
      to_stage_id: action === "move_stage" ? toStageId : null,
      message_body: action === "send_message" ? message : null,
      trigger,
      trigger_days: needsDays ? days : null,
    });
    setSaving(false);
    if (r && "error" in r) {
      setError(r.error);
      return;
    }
    setAdding(false);
    setMessage("");
    await load();
    router.refresh();
  }

  async function toggle(a: Automation) {
    setAutomations((prev) =>
      prev.map((x) => (x.id === a.id ? { ...x, active: !x.active } : x))
    );
    await toggleAutomation(a.id, !a.active);
    router.refresh();
  }

  async function remove(id: string) {
    setAutomations((prev) => prev.filter((x) => x.id !== id));
    await deleteAutomation(id);
    router.refresh();
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={
        <span className="flex items-center gap-2 text-base font-semibold text-[var(--color-foreground)]">
          <Zap className="h-4 w-4 text-[var(--color-primary)]" />
          Automações · {pipeline.name}
        </span>
      }
      description="Mova os cards sozinho a partir de regras. As regras de tempo rodam a cada minuto; as de resposta, na hora que o cliente responde."
      size="lg"
      className="max-h-[85vh]"
      dismissible={!saving}
    >
      <div className="flex h-full min-h-0 flex-col">
        {error && (
          <p className="mb-3 rounded-lg bg-[var(--color-danger)]/10 px-3 py-2 text-xs text-[var(--color-danger)]">
            {error}
          </p>
        )}

        {/* Lista de automações */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-[var(--color-muted)]" />
            </div>
          ) : automations.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[var(--color-border-strong)] px-4 py-8 text-center">
              <Zap className="mx-auto mb-2 h-6 w-6 text-[var(--color-muted-2)]" />
              <p className="text-sm text-[var(--color-muted)]">
                Nenhuma automação ainda.
              </p>
              <p className="mt-0.5 text-xs text-[var(--color-muted-2)]">
                Crie regras pra mover cards automaticamente.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {automations.map((a) => {
                const Icon = TRIGGER_ICON[a.trigger];
                return (
                  <li
                    key={a.id}
                    className="flex items-center gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2.5"
                  >
                    <Icon
                      className={`h-4 w-4 shrink-0 ${
                        a.active
                          ? "text-[var(--color-primary)]"
                          : "text-[var(--color-muted-2)]"
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      <p
                        className={`flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm ${
                          a.active ? "" : "opacity-50"
                        }`}
                      >
                        <span className="text-[var(--color-muted)]">
                          {AUTOMATION_TRIGGER[a.trigger].label}
                        </span>
                        {AUTOMATION_TRIGGER[a.trigger].needsDays && (
                          <span className="font-medium">
                            {a.trigger_days} dia(s)
                          </span>
                        )}
                        <span className="text-[var(--color-muted)]">em</span>
                        <b className="font-semibold">{stageName(a.stage_id)}</b>
                        <ArrowRight className="h-3.5 w-3.5 text-[var(--color-muted-2)]" />
                        {a.action === "send_message" ? (
                          <>
                            <span className="flex items-center gap-1 text-[var(--color-muted)]">
                              <MessageSquareText className="h-3.5 w-3.5" />
                              enviar
                            </span>
                            <b
                              className="max-w-[160px] truncate font-medium text-[var(--color-primary)]"
                              title={a.message_body ?? ""}
                            >
                              &ldquo;{a.message_body}&rdquo;
                            </b>
                          </>
                        ) : (
                          <>
                            <span className="text-[var(--color-muted)]">mover para</span>
                            <b className="font-semibold text-[var(--color-primary)]">
                              {stageName(a.to_stage_id)}
                            </b>
                          </>
                        )}
                      </p>
                    </div>
                    <button
                      onClick={() => toggle(a)}
                      className={`relative h-5 w-9 shrink-0 rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-surface-2)] ${
                        a.active
                          ? "bg-[var(--color-primary)]"
                          : "bg-[var(--color-border-strong)]"
                      }`}
                      aria-label={a.active ? "Desativar" : "Ativar"}
                      title={a.active ? "Ativa" : "Pausada"}
                    >
                      <span
                        className={`absolute top-0.5 h-4 w-4 rounded-full bg-[var(--color-surface)] transition-all ${
                          a.active ? "left-4" : "left-0.5"
                        }`}
                      />
                    </button>
                    <button
                      onClick={() => remove(a.id)}
                      className="grid min-h-9 min-w-9 shrink-0 place-items-center rounded-[var(--radius-control)] text-[var(--color-muted-2)] hover:text-[var(--color-danger)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
                      aria-label="Excluir automação"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Formulário / botão adicionar */}
        <div className="mt-4 border-t border-[var(--color-border)] pt-4">
          {!adding ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setAdding(true)}
              disabled={stages.length < 2}
              className="w-full justify-center"
            >
              <Plus className="mr-1 h-4 w-4" />
              Nova automação
            </Button>
          ) : (
            <div className="space-y-3">
              {/* Gatilho */}
              <div>
                <label htmlFor="automation-trigger" className="mb-1 block text-xs text-[var(--color-muted)]">
                  Quando
                </label>
                <select
                  id="automation-trigger"
                  value={trigger}
                  onChange={(e) =>
                    setTrigger(e.target.value as AutomationTrigger)
                  }
                  className={`${SELECT_CLASS} w-full`}
                >
                  {TRIGGER_ORDER.map((t) => (
                    <option key={t} value={t}>
                      {AUTOMATION_TRIGGER[t].label}
                      {AUTOMATION_TRIGGER[t].needsDays ? " X dias" : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-end gap-2">
                {needsDays && (
                  <div className="w-24">
                    <label htmlFor="automation-days" className="mb-1 block text-xs text-[var(--color-muted)]">
                      Dias
                    </label>
                    <input
                      id="automation-days"
                      type="number"
                      min={1}
                      value={days}
                      onChange={(e) =>
                        setDays(Math.max(1, Number(e.target.value) || 1))
                      }
                      className={`${SELECT_CLASS} w-full`}
                    />
                  </div>
                )}
                <div className="flex-1">
                  <label htmlFor="automation-stage" className="mb-1 block text-xs text-[var(--color-muted)]">
                    Na etapa
                  </label>
                  <select
                    id="automation-stage"
                    value={stageId}
                    onChange={(e) => setStageId(e.target.value)}
                    className={`${SELECT_CLASS} w-full`}
                  >
                    {stages.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="automation-action" className="mb-1 block text-xs text-[var(--color-muted)]">
                  Então
                </label>
                <select
                  id="automation-action"
                  value={action}
                  onChange={(e) => setAction(e.target.value as AutomationAction)}
                  className={`${SELECT_CLASS} w-full`}
                >
                  {(Object.keys(AUTOMATION_ACTION) as AutomationAction[])
                    .filter((a) => !(trigger === "enter_stage" && a === "move_stage"))
                    .map((a) => (
                      <option key={a} value={a}>
                        {AUTOMATION_ACTION[a]}
                      </option>
                    ))}
                </select>
              </div>

              {action === "move_stage" ? (
                <div>
                  <label htmlFor="automation-to-stage" className="mb-1 block text-xs text-[var(--color-muted)]">
                    Mover o card para
                  </label>
                  <select
                    id="automation-to-stage"
                    value={toStageId}
                    onChange={(e) => setToStageId(e.target.value)}
                    className={`${SELECT_CLASS} w-full`}
                  >
                    {stages
                      .filter((s) => s.id !== stageId)
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                  </select>
                </div>
              ) : (
                <div>
                  <label htmlFor="automation-message" className="mb-1 block text-xs text-[var(--color-muted)]">
                    Mensagem do WhatsApp
                  </label>
                  <Textarea
                    id="automation-message"
                    rows={3}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder={"{saudacao} {nome}! Tudo bem?..."}
                  />
                  <p className="mt-1 text-[11px] text-[var(--color-muted-2)]">
                    Variáveis: {"{nome}"} e {"{saudacao}"}. Envia 1x por lead,
                    só em horário comercial (8h–20h).
                  </p>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setAdding(false)}
                >
                  Cancelar
                </Button>
                <Button size="sm" onClick={save} disabled={saving}>
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Salvar automação"
                  )}
                </Button>
              </div>
            </div>
          )}
          {stages.length < 2 && !loading && (
            <p className="mt-2 text-center text-[11px] text-[var(--color-muted-2)]">
              Crie pelo menos 2 etapas neste funil para montar automações.
            </p>
          )}
        </div>
      </div>
    </Dialog>
  );
}
