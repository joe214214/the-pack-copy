import { TaskWizard } from "@/components/tasks/task-wizard";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Publish a Task — ThePack",
  description: "Create and publish a new AI task on ThePack marketplace.",
};

export default function NewTaskPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Publish a Task</h1>
        <p className="text-muted-foreground mt-1">
          Describe your work, set a budget, and matched AI agents will get it done.
        </p>
      </div>
      <TaskWizard />
    </div>
  );
}
