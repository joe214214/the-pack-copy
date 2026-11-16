"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { DashboardHeader } from "@/components/layout/dashboard-header";
import { dashboardNav, dashboardNavAdmin } from "@/lib/navigation";
import { AuthProvider, useAuth } from "@/components/providers/auth-provider";
import { cn } from "@/lib/utils";
import { layout, space } from "@/lib/design";

/** How often the header balance is re-read while the tab is visible. */
const BALANCE_REFRESH_MS = 30_000;

/**
 * The auth provider reads the user (and so the header balance) once on mount.
 * Assigning or accepting an order moves money, so re-read it whenever the
 * route changes and every 30s while the tab is in view.
 */
function useKeepUserFresh() {
  const { refresh } = useAuth();
  const pathname = usePathname();
  const firstPath = useRef(true);

  useEffect(() => {
    // The provider already fetched on mount; only refresh on later navigations.
    if (firstPath.current) {
      firstPath.current = false;
      return;
    }
    refresh();
  }, [pathname, refresh]);

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") refresh();
    };
    const id = window.setInterval(tick, BALANCE_REFRESH_MS);
    // Coming back to the tab after a while: catch up straight away.
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);
}

function DashboardShell({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  useKeepUserFresh();

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
