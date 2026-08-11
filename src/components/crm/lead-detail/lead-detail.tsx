"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { toast } from "@/components/ui/toast";
import { useRole } from "@/components/context/role-context";
import {
  addNote,
  addTag,
  removeTag,
  updateLead,
  deleteLead,
} from "@/app/(dashboard)/crm/actions";
import { analyzeLead } from "@/app/(dashboard)/crm/ai-actions";
import { StageSelector } from "./stage-selector";
import { ContactCard } from "./contact-card";
import { AiAnalysisCard } from "./ai-analysis-card";
import { TaskSection } from "./task-section";
import { NotesSection } from "./notes-section";
import { LeadSidebar } from "./sidebar";
import { TAG_COLORS } from "./constants";
import type { LeadDetailProps } from "./types";

export function LeadDetail({
  lead,
  stages,
  notes,
  transfers,
  team,
  tasks,
  currentUserId,
}: LeadDetailProps) {
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

  async function handleAnalyze() {
    setAiBusy(true);
    setAiError(null);
    const r = await analyzeLead(lead.id);
    setAiBusy(false);
    if (r && "error" in r && r.error) setAiError(r.error);
    else router.refresh();
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

      <StageSelector
        stages={stages}
        currentStageId={lead.stage_id}
        onChangeStage={changeStage}
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <ContactCard
            lead={lead}
            role={role}
            editing={editing}
            saving={saving}
            deleting={deleting}
            form={form}
            onFormChange={setForm}
            onEdit={() => setEditing(true)}
            onCancelEdit={() => setEditing(false)}
            onSave={saveDetails}
            onDelete={removeLead}
          />

          <AiAnalysisCard
            lead={lead}
            aiBusy={aiBusy}
            aiError={aiError}
            onAnalyze={handleAnalyze}
          />

          <TaskSection
            leadId={lead.id}
            tasks={tasks}
            team={team}
            currentUserId={currentUserId}
          />

          <NotesSection
            notes={notes}
            note={note}
            savingNote={savingNote}
            onNoteChange={setNote}
            onSubmit={submitNote}
          />
        </div>

        <LeadSidebar
          lead={lead}
          team={team}
          role={role}
          transfers={transfers}
          showTransfer={showTransfer}
          newTag={newTag}
          onShowTransferChange={setShowTransfer}
          onNewTagChange={setNewTag}
          onSubmitTag={submitTag}
          onRemoveTag={async (tagId) => {
            await removeTag(tagId, lead.id);
            router.refresh();
          }}
          onTransferDone={() => {
            setShowTransfer(false);
            router.refresh();
          }}
        />
      </div>
    </div>
  );
}
