import { readableInk } from "@/lib/utils/ui";
import type { PipelineStage } from "@/lib/types";

export function StageSelector({
  stages,
  currentStageId,
  onChangeStage,
}: {
  stages: PipelineStage[];
  currentStageId: string | null;
  onChangeStage: (stageId: string) => void;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-center gap-1.5">
      {stages.map((s) => {
        const active = s.id === currentStageId;
        return (
          <button
            key={s.id}
            onClick={() => !active && onChangeStage(s.id)}
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
  );
}
