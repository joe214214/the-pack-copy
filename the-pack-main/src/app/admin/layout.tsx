"use client";

import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { DashboardHeader } from "@/components/layout/dashboard-header";
import { adminNav } from "@/lib/navigation";
import { AuthProvider, useAuth } from "@/components/providers/auth-provider";

function AdminShell({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

  const displayUser = {
    name: user?.name ?? "Admin",
    email: user?.email ?? "",
    role: "ADMIN",
    balance: user ? user.balance.toFixed(2) : undefined,
  };

  return (
    <SidebarProvider>
      <AppSidebar navigation={adminNav} user={displayUser} />
      <SidebarInset>
        <DashboardHeader user={displayUser} />
        <main className="flex-1 p-6">
          <div className="animate-in">{children}</div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthProvider>
      <AdminShell>{children}</AdminShell>
    </AuthProvider>
  );
}
