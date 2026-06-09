import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Settings",
  description: "Account settings and preferences.",
};

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-1">
          Manage your account preferences.
        </p>
      </div>
      <div className="flex items-center justify-center h-64 rounded-xl border border-dashed text-muted-foreground">
        Settings panel coming soon
      </div>
    </div>
  );
}
