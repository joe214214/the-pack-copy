/**
 * Task type metadata — icons, labels, descriptions, and color associations.
 * Used across the task wizard, task cards, and filtering.
 */
import {
  FileText,
  PenLine,
  FileSearch,
  Languages,
  BarChart3,
  FileStack,
  type LucideIcon,
} from "lucide-react";

export type TaskTypeId =
  | "CONTENT_WRITING"
  | "CONTENT_EDITING"
  | "SUMMARIZATION"
  | "TRANSLATION"
  | "REPORT_GENERATION"
  | "DATA_EXTRACTION"
  | "TEMPLATE_FILLING"
  | "FORMATTING";

export interface TaskTypeMeta {
  id: TaskTypeId;
  label: string;
  description: string;
  icon: LucideIcon;
  color: string;
  bgColor: string;
  borderColor: string;
  examples: string[];
}

export const TASK_TYPES: TaskTypeMeta[] = [
  {
    id: "CONTENT_WRITING",
    label: "Content Writing",
    description: "Blog posts, articles, social copy, product descriptions.",
    icon: FileText,
    color: "text-blue-400",
    bgColor: "bg-blue-500/10",
    borderColor: "border-blue-500/30",
    examples: ["Blog post", "Product description", "LinkedIn article"],
  },
  {
    id: "CONTENT_EDITING",
    label: "Content Editing",
    description: "Polish, rewrite, and improve existing content.",
    icon: PenLine,
    color: "text-violet-400",
    bgColor: "bg-violet-500/10",
    borderColor: "border-violet-500/30",
    examples: ["Email copy review", "Brand voice alignment", "SEO optimization"],
  },
  {
    id: "SUMMARIZATION",
    label: "Summarization",
    description: "Condense documents, meetings, and reports into key points.",
    icon: FileSearch,
    color: "text-emerald-400",
    bgColor: "bg-emerald-500/10",
    borderColor: "border-emerald-500/30",
    examples: ["Meeting notes", "Research paper", "Legal document"],
  },
  {
    id: "TRANSLATION",
    label: "Translation",
    description: "Accurate translation preserving tone and formatting.",
    icon: Languages,
    color: "text-amber-400",
    bgColor: "bg-amber-500/10",
    borderColor: "border-amber-500/30",
    examples: ["Product docs EN→JP", "Marketing copy", "Technical specs"],
  },
  {
    id: "REPORT_GENERATION",
    label: "Report Generation",
    description: "Structure data into formatted reports with insights.",
    icon: BarChart3,
    color: "text-rose-400",
    bgColor: "bg-rose-500/10",
    borderColor: "border-rose-500/30",
    examples: ["Sales report", "Analytics summary", "Financial overview"],
  },
  {
    id: "TEMPLATE_FILLING",
    label: "Template Filling",
    description: "Populate templates with data, keeping format intact.",
    icon: FileStack,
    color: "text-cyan-400",
    bgColor: "bg-cyan-500/10",
    borderColor: "border-cyan-500/30",
    examples: ["Invoice generation", "Contract fill-in", "Proposal creation"],
  },
];

export const TASK_TYPE_MAP = Object.fromEntries(
  TASK_TYPES.map((t) => [t.id, t])
) as Record<TaskTypeId, TaskTypeMeta>;

export function getTaskType(id: string): TaskTypeMeta | undefined {
  return TASK_TYPE_MAP[id as TaskTypeId];
}
