"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TASK_TYPES, type TaskTypeId } from "@/lib/task-types";
import {
  ArrowRight,
  ArrowLeft,
  Loader2,
  CheckCircle2,
  Upload,
  DollarSign,
  Clock,
  FileText,
} from "lucide-react";
import { toast } from "sonner";

// ============================================================================
// Step definitions
// ============================================================================
const STEPS = [
  { id: 1, label: "Type", description: "What kind of task?" },
  { id: 2, label: "Details", description: "Describe your task" },
  { id: 3, label: "Budget", description: "Set budget & deadline" },
];

// ============================================================================
// Types
// ============================================================================
interface WizardState {
  type: TaskTypeId | "";
  title: string;
  description: string;
  outputFormat: string;
  inputFilesNote: string;
  budget: string;
  deadlineHours: string;
}

const INITIAL_STATE: WizardState = {
  type: "",
  title: "",
  description: "",
  outputFormat: "",
  inputFilesNote: "",
  budget: "",
  deadlineHours: "4",
};

// ============================================================================
// Step 1 — Task Type Selector
// ============================================================================
function StepType({
  value,
  onChange,
}: {
  value: TaskTypeId | "";
  onChange: (v: TaskTypeId) => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">What type of task is this?</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Select the category that best describes the work.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {TASK_TYPES.map((type) => (
          <button
            key={type.id}
            onClick={() => onChange(type.id)}
            className={cn(
              "group relative flex flex-col items-start gap-2 rounded-xl border p-4 text-left",
              "transition-all duration-150 cursor-pointer",
              "hover:border-primary/30 hover:bg-muted/30",
              value === type.id
                ? "border-primary bg-primary/5 shadow-sm shadow-primary/10"
                : "border-border bg-card/50"
            )}
          >
            {value === type.id && (
              <CheckCircle2 className="absolute top-3 right-3 h-4 w-4 text-primary" />
            )}
            <div className={cn("rounded-lg p-2", type.bgColor)}>
              <type.icon className={cn("h-5 w-5", type.color)} />
            </div>
            <div>
              <p className="text-sm font-semibold">{type.label}</p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                {type.description}
              </p>
            </div>
            <div className="flex flex-wrap gap-1 mt-1">
              {type.examples.map((ex) => (
                <span
                  key={ex}
                  className="text-xs text-muted-foreground bg-muted/50 rounded px-1.5 py-0.5"
                >
                  {ex}
                </span>
              ))}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Step 2 — Task Details
// ============================================================================
function StepDetails({
  state,
  onChange,
}: {
  state: WizardState;
  onChange: (updates: Partial<WizardState>) => void;
}) {
  const selectedType = TASK_TYPES.find((t) => t.id === state.type);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Describe your task</h2>
        <p className="text-sm text-muted-foreground mt-1">
          The more detail you provide, the better agent match you&apos;ll get.
        </p>
      </div>

      {selectedType && (
        <div className={cn("flex items-center gap-2 rounded-lg border p-3 text-sm", selectedType.bgColor, selectedType.borderColor)}>
          <selectedType.icon className={cn("h-4 w-4 shrink-0", selectedType.color)} />
          <span className={selectedType.color}>{selectedType.label}</span>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="title">Task Title *</Label>
        <Input
          id="title"
          placeholder={
            state.type === "CONTENT_WRITING"
              ? 'e.g., "Write a 1500-word blog post about AI in healthcare"'
              : "Short, descriptive title for your task"
          }
          value={state.title}
          onChange={(e) => onChange({ title: e.target.value })}
          maxLength={200}
        />
        <p className="text-xs text-muted-foreground">{state.title.length}/200 characters</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Task Description *</Label>
        <Textarea
          id="description"
          placeholder="Describe exactly what you need. Include:
• Topic, subject, or content area
• Target audience
• Specific requirements or constraints
• Style, tone, or format preferences
• Any reference materials or examples"
          value={state.description}
          onChange={(e) => onChange({ description: e.target.value })}
          rows={7}
          maxLength={5000}
          className="resize-none font-mono text-sm"
        />
        <p className="text-xs text-muted-foreground">
          {state.description.length}/5000 · Minimum 20 characters
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="outputFormat">Expected Output Format</Label>
        <Input
          id="outputFormat"
          placeholder='e.g., "Markdown file, 1200-1800 words" or "PDF with charts"'
          value={state.outputFormat}
          onChange={(e) => onChange({ outputFormat: e.target.value })}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="inputFiles">
          <Upload className="inline h-4 w-4 mr-1" />
          Input Files / Reference Materials
        </Label>
        <Textarea
          id="inputFiles"
          placeholder="Describe any files or documents the agent will need. (File upload coming soon — list URLs or descriptions here)"
          value={state.inputFilesNote}
          onChange={(e) => onChange({ inputFilesNote: e.target.value })}
          rows={3}
          className="resize-none text-sm"
        />
        <p className="text-xs text-muted-foreground">
          File upload integration in next release. Paste links or describe materials.
        </p>
      </div>
    </div>
  );
}

// ============================================================================
// Step 3 — Budget & Deadline
// ============================================================================
const DEADLINE_PRESETS = [
  { label: "1 hour", value: "1" },
  { label: "4 hours", value: "4" },
  { label: "8 hours", value: "8" },
  { label: "24 hours", value: "24" },
  { label: "48 hours", value: "48" },
];

const BUDGET_SUGGESTIONS = [15, 25, 50, 100, 200];

function StepBudget({
  state,
  onChange,
}: {
  state: WizardState;
  onChange: (updates: Partial<WizardState>) => void;
}) {
  const platformFee = state.budget ? parseFloat(state.budget) * 0.1 : 0;
  const agentReceives = state.budget ? parseFloat(state.budget) - platformFee : 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Budget & Deadline</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Competitive budgets attract top-rated agents faster.
        </p>
      </div>

      {/* Budget */}
      <div className="space-y-3">
        <Label htmlFor="budget">
          <DollarSign className="inline h-4 w-4 mr-1" />
          Budget (USD) *
        </Label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">$</span>
          <Input
            id="budget"
            type="number"
            min={5}
            max={10000}
            step={5}
            placeholder="0.00"
            value={state.budget}
            onChange={(e) => onChange({ budget: e.target.value })}
            className="pl-7"
          />
        </div>
        {/* Quick suggestions */}
        <div className="flex flex-wrap gap-2">
          {BUDGET_SUGGESTIONS.map((amt) => (
            <button
              key={amt}
              onClick={() => onChange({ budget: String(amt) })}
              className={cn(
                "rounded-md border px-3 py-1 text-xs font-medium transition-colors",
                state.budget === String(amt)
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:border-primary/30 hover:text-foreground"
              )}
            >
              ${amt}
            </button>
          ))}
        </div>

        {/* Fee breakdown */}
        {state.budget && parseFloat(state.budget) > 0 && (
          <div className="rounded-lg border bg-muted/20 p-3 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Task budget</span>
              <span>${parseFloat(state.budget).toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Platform fee (10%)</span>
              <span>−${platformFee.toFixed(2)}</span>
            </div>
            <div className="flex justify-between border-t border-border/50 pt-1.5 font-medium text-emerald-500">
              <span>Agent receives</span>
              <span>${agentReceives.toFixed(2)}</span>
            </div>
          </div>
        )}
      </div>

      {/* Deadline */}
      <div className="space-y-3">
        <Label>
          <Clock className="inline h-4 w-4 mr-1" />
          Deadline
        </Label>
        <div className="flex flex-wrap gap-2">
          {DEADLINE_PRESETS.map((preset) => (
            <button
              key={preset.value}
              onClick={() => onChange({ deadlineHours: preset.value })}
              className={cn(
                "rounded-md border px-3 py-1.5 text-sm font-medium transition-colors",
                state.deadlineHours === preset.value
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:border-primary/30 hover:text-foreground"
              )}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={1}
            max={720}
            value={state.deadlineHours}
            onChange={(e) => onChange({ deadlineHours: e.target.value })}
            className="w-24"
          />
          <span className="text-sm text-muted-foreground">hours from task creation</span>
        </div>
      </div>

      {/* Summary card */}
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-2">
        <div className="flex items-center gap-2 font-medium text-sm">
          <FileText className="h-4 w-4 text-primary" />
          Task Summary
        </div>
        <div className="space-y-1 text-sm">
          <p className="font-medium truncate">{state.title || "Untitled task"}</p>
          <p className="text-muted-foreground text-xs line-clamp-2">
            {state.description || "No description provided"}
          </p>
          <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
            <span className="text-emerald-500 font-medium">
              ${state.budget || "0"} budget
            </span>
            <span>{state.deadlineHours}h deadline</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Main Wizard
// ============================================================================
export function TaskWizard() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [state, setState] = useState<WizardState>(INITIAL_STATE);
  const [submitting, setSubmitting] = useState(false);

  const update = (updates: Partial<WizardState>) =>
    setState((prev) => ({ ...prev, ...updates }));

  const canProceed = () => {
    if (step === 1) return !!state.type;
    if (step === 2)
      return state.title.trim().length >= 5 && state.description.trim().length >= 20;
    if (step === 3)
      return (
        parseFloat(state.budget) >= 5 &&
        parseInt(state.deadlineHours) >= 1
      );
    return false;
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const response = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: state.type,
          title: state.title.trim(),
          description: state.description.trim(),
          outputFormat: state.outputFormat.trim() || undefined,
          budget: parseFloat(state.budget),
          deadlineHours: parseInt(state.deadlineHours),
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error ?? "Failed to create task");
      }

      const { task } = await response.json();
      toast.success("Task published! Finding matching agents...");
      router.push(`/dashboard/tasks/${task.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      {/* Progress indicator */}
      <div className="mb-8">
        <div className="flex items-center gap-0">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center flex-1">
              <button
                onClick={() => step > s.id && setStep(s.id)}
                className="flex items-center gap-2 group"
                disabled={step <= s.id}
              >
                <div
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-full border-2 text-sm font-semibold transition-all",
                    step > s.id
                      ? "border-primary bg-primary text-primary-foreground"
                      : step === s.id
                      ? "border-primary text-primary"
                      : "border-muted-foreground/30 text-muted-foreground/50"
                  )}
                >
                  {step > s.id ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : (
                    s.id
                  )}
                </div>
                <div className="text-left hidden sm:block">
                  <p
                    className={cn(
                      "text-xs font-medium",
                      step >= s.id ? "text-foreground" : "text-muted-foreground/50"
                    )}
                  >
                    {s.label}
                  </p>
                  <p className="text-xs text-muted-foreground">{s.description}</p>
                </div>
              </button>
              {i < STEPS.length - 1 && (
                <div
                  className={cn(
                    "flex-1 h-px mx-3",
                    step > s.id ? "bg-primary" : "bg-muted-foreground/20"
                  )}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Step content */}
      <div className="animate-in rounded-xl border bg-card/50 p-6 min-h-[420px]">
        {step === 1 && (
          <StepType value={state.type} onChange={(v) => update({ type: v })} />
        )}
        {step === 2 && <StepDetails state={state} onChange={update} />}
        {step === 3 && <StepBudget state={state} onChange={update} />}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between mt-6">
        <Button
          variant="ghost"
          onClick={() => (step === 1 ? router.back() : setStep(step - 1))}
          disabled={submitting}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          {step === 1 ? "Cancel" : "Back"}
        </Button>

        {step < 3 ? (
          <Button
            onClick={() => setStep(step + 1)}
            disabled={!canProceed()}
            className="glow-sm"
          >
            Continue
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        ) : (
          <Button
            onClick={handleSubmit}
            disabled={!canProceed() || submitting}
            className="glow"
          >
            {submitting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="mr-2 h-4 w-4" />
            )}
            Publish Task
          </Button>
        )}
      </div>
    </div>
  );
}
