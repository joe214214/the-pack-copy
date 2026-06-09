"use client";

import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { DashboardHeader } from "@/components/layout/dashboard-header";
import { dashboardNav } from "@/lib/navigation";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // TODO: Replace with real user data from Supabase session
  const mockUser = {
    name: "Alex Chen",
    email: "alex@example.com",
    role: "PUBLISHER",
    balance: "2,450.00",
  };

  return (
    <SidebarProvider>
      <AppSidebar navigation={dashboardNav} user={mockUser} />
      <SidebarInset>
        <DashboardHeader user={mockUser} />
        <main className="flex-1 p-6">
          <div className="animate-in">{children}</div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
