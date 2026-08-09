"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { addTag, removeTag } from "@/app/(dashboard)/crm/actions";
import { SECTION_LABEL, type RunMutation } from "@/components/chat/conversation/lead-panel/ui";
import type { LeadTag } from "@/lib/types";

const TAG_PALETTE = ["#1d6fff", "#00d4ff", "#00e5a0", "#fbbf24", "#ff5c5c", "#f472b6"];

export function TagsSection({
  leadId,
  tags,
  run,
}: {
  leadId: string;
  tags: LeadTag[];
  run: RunMutation;
}) {
  const [newTag, setNewTag] = useState("");

  return (
    <div>
      <label className={SECTION_LABEL}>Tags</label>
      <div className="mb-2 flex flex-wrap gap-1">
        {tags.map((t) => (
          <span
            key={t.id}
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium"
            style={{ backgroundColor: `${t.color}22`, color: t.color }}
          >
            {t.tag}
            <button
              onClick={() => run(() => removeTag(t.id, leadId))}
              aria-label={`Remover tag ${t.tag}`}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-1.5">
        <Input
          value={newTag}
          onChange={(e) => setNewTag(e.target.value)}
          placeholder="Nova tag"
          className="h-8 text-xs"
          onKeyDown={(e) => {
            if (e.key === "Enter" && newTag.trim()) {
              const color = TAG_PALETTE[tags.length % TAG_PALETTE.length];
              run(() => addTag(leadId, newTag.trim(), color));
              setNewTag("");
            }
          }}
        />
      </div>
    </div>
  );
}
