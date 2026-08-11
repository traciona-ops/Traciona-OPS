import type {
  Lead,
  LeadNote,
  LeadTag,
  LeadTask,
  LeadTransfer,
  PipelineStage,
  Profile,
} from "@/lib/types";

export type LeadDetailProps = {
  lead: Lead & { tags: LeadTag[]; owner: Profile | null };
  stages: PipelineStage[];
  notes: (LeadNote & { author?: { name: string } })[];
  transfers: (LeadTransfer & { from?: { name: string }; to?: { name: string } })[];
  team: Profile[];
  tasks: (LeadTask & { assignee?: { name: string } })[];
  currentUserId: string;
};

export type ContactForm = {
  name: string;
  phone: string;
  email: string;
  company: string;
  instagram: string;
  value: string;
};
