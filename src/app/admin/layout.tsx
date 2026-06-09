"use client";

import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { DashboardHeader } from "@/components/layout/dashboard-header";
import { adminNav } from "@/lib/navigation";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // TODO: Replace with real admin user + role check
  const mockAdmin = {
    name: "Admin User",
    email: "admin@thepack.ai",
    role: "ADMIN",
    balance: "—",
  };

  return (
    <SidebarProvider>
      <AppSidebar navigation={adminNav} user={mockAdmin} />
      <SidebarInset>
        <DashboardHeader user={mockAdmin} />
        <main className="flex-1 p-6">
          <div className="animate-in">{children}</div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
