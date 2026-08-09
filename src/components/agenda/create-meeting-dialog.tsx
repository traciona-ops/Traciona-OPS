"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog } from "@/components/ui/dialog";
import { DateTimePicker, toLocalInput } from "@/components/agenda/datetime-picker";
import { createMeeting } from "@/app/(dashboard)/agenda/actions";
import { Calendar } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "@/components/ui/toast";

interface Lead {
  id: string;
  name: string;
}

interface CreateMeetingDialogProps {
  initialDate?: string;
  onClose?: () => void;
}

export function CreateMeetingDialog({ initialDate, onClose }: CreateMeetingDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    starts_at: initialDate || "",
    ends_at: "",
    lead_id: "",
  });

  useEffect(() => {
    if (initialDate) {
      setOpen(true);
      const end = new Date(initialDate);
      end.setHours(end.getHours() + 1);
      setFormData((prev) => ({
        ...prev,
        starts_at: initialDate,
        ends_at: toLocalInput(end),
      }));
    }
  }, [initialDate]);

  useEffect(() => {
    if (open) {
      fetchLeads();
    }
  }, [open]);

  const fetchLeads = async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("leads")
      .select("id, name")
      .order("name", { ascending: true })
      .limit(50);
    if (data) setLeads(data);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title || !formData.starts_at) return;

    setLoading(true);

    try {
      const result = await createMeeting({
        title: formData.title,
        description: formData.description || undefined,
        starts_at: new Date(formData.starts_at).toISOString(),
        ends_at: formData.ends_at ? new Date(formData.ends_at).toISOString() : undefined,
        lead_id: formData.lead_id || undefined,
      });

      if (result.syncError) {
        toast(`Reunião criada, mas não foi pro Google: ${result.syncError}`, {
          type: "error",
        });
      }

      setOpen(false);
      setFormData({
        title: "",
        description: "",
        starts_at: "",
        ends_at: "",
        lead_id: "",
      });
      window.location.reload();
    } catch (error) {
      console.error("Error creating meeting:", error);
      toast("Erro ao criar reunião", { type: "error" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {!initialDate && (
        <Button onClick={() => setOpen(true)} className="mb-4">
          + Nova reunião
        </Button>
      )}

      <Dialog
        open={open}
        onClose={() => {
          setOpen(false);
          setFormData({ title: "", description: "", starts_at: "", ends_at: "", lead_id: "" });
          onClose?.();
        }}
        title="Nova reunião"
        size="3xl"
        dismissible={!loading}
        footer={
          <div className="flex gap-3 justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setOpen(false);
                onClose?.();
              }}
              disabled={loading}
              className="px-6"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={loading || !formData.title || !formData.starts_at}
              className="px-6"
            >
              {loading ? "Criando..." : "Criar reunião"}
            </Button>
          </div>
        }
      >
        <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-12">
          {/* Coluna 1: Formulário */}
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-semibold mb-2 text-[var(--color-foreground)]">
                Assunto *
              </label>
              <Input
                required
                autoFocus
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="Ex: Reunião com cliente"
                className="h-10"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2 text-[var(--color-foreground)]">
                Cliente
              </label>
              <select
                value={formData.lead_id}
                onChange={(e) => setFormData({ ...formData, lead_id: e.target.value })}
                className="w-full h-10 px-3 rounded-md border border-[var(--color-border)] bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              >
                <option value="">Selecionar cliente (opcional)</option>
                {leads.map((lead) => (
                  <option key={lead.id} value={lead.id}>
                    {lead.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold mb-2 text-[var(--color-foreground)]">
                Descrição
              </label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Notas, agenda, links..."
                rows={4}
                className="text-sm"
              />
            </div>

            <div className="flex items-center gap-2 text-xs text-[var(--color-muted)] bg-[var(--color-surface-2)] p-3 rounded-md">
              <Calendar className="w-4 h-4 flex-shrink-0" />
              <span>Link do Google Meet será gerado automaticamente</span>
            </div>
          </div>

          {/* Coluna 2: Data e Hora */}
          <div className="space-y-6">
            <DateTimePicker
              label="Início *"
              value={formData.starts_at}
              onChange={(val) => {
                setFormData({ ...formData, starts_at: val });
                if (val) {
                  const endDate = new Date(val);
                  endDate.setHours(endDate.getHours() + 1);
                  setFormData((prev) => ({
                    ...prev,
                    starts_at: val,
                    ends_at: prev.ends_at || toLocalInput(endDate),
                  }));
                }
              }}
            />

            <div>
              <label className="block text-sm font-semibold mb-2 text-[var(--color-foreground)]">
                Fim
              </label>
              <Input
                type="time"
                value={formData.ends_at ? new Date(formData.ends_at).toTimeString().slice(0, 5) : "10:00"}
                onChange={(e) => {
                  if (formData.starts_at) {
                    const d = new Date(formData.starts_at);
                    const [h, m] = e.target.value.split(":");
                    d.setHours(parseInt(h), parseInt(m));
                    setFormData({ ...formData, ends_at: toLocalInput(d) });
                  }
                }}
                className="h-10"
              />
            </div>
          </div>
        </form>
      </Dialog>
    </>
  );
}
