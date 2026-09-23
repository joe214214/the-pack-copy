"use client";

import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { DashboardHeader } from "@/components/layout/dashboard-header";
import { dashboardNav, dashboardNavAdmin } from "@/lib/navigation";
import { AuthProvider, useAuth } from "@/components/providers/auth-provider";
import { cn } from "@/lib/utils";
import { layout, space } from "@/lib/design";

function DashboardShell({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

  const displayUser = {
    name: user?.name ?? "User",
    email: user?.email ?? "",
    role: user?.roles?.[0] ?? "PUBLISHER",
    balance: user ? user.balance.toFixed(2) : undefined,
  };

  const nav = user?.isAdmin ? dashboardNavAdmin : dashboardNav;

  return (
    <SidebarProvider>
      <AppSidebar navigation={nav} user={displayUser} />
      <SidebarInset>
        <DashboardHeader user={displayUser} />
        {/* The content column is capped and centred here rather than per page.
            Without it every dashboard page ran the full width of the display,
            so on a wide monitor rows stretched into unreadable single lines. */}
        <main className={cn("flex-1", space.page)}>
          <div className={cn(layout.container, "animate-in")}>{children}</div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthProvider>
      <DashboardShell>{children}</DashboardShell>
    </AuthProvider>
  );
}
