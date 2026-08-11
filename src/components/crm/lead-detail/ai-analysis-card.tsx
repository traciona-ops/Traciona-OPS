"use client";

import { Sparkles, Loader2 } from "lucide-react";
import type { Lead } from "@/lib/types";

export function AiAnalysisCard({
  lead,
  aiBusy,
  aiError,
  onAnalyze,
}: {
  lead: Lead;
  aiBusy: boolean;
  aiError: string | null;
  onAnalyze: () => void;
}) {
  return (
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
          onClick={onAnalyze}
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
          Clique em &ldquo;Analisar com IA&rdquo; pra gerar o score do lead, o resumo da
          dor e a abordagem sugerida a partir da conversa.
        </p>
      )}
    </div>
  );
}
