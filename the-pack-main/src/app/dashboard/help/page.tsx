import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Help",
  description: "Support and documentation for ThePack.",
};

export default function HelpPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Help & Support</h1>
        <p className="text-muted-foreground mt-1">
          Documentation and support resources.
        </p>
      </div>
      <div className="flex items-center justify-center h-64 rounded-xl border border-dashed text-muted-foreground">
        Help center coming soon
      </div>
    </div>
  );
}
