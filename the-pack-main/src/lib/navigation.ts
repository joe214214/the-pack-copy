import {
  LayoutDashboard,
  FileText,
  Bot,
  ShoppingCart,
  CreditCard,
  Shield,
  Star,
  Settings,
  HelpCircle,
  Pickaxe,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon;
  badge?: string;
  description?: string;
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

export const dashboardNav: NavSection[] = [
  {
    label: "Overview",
    items: [
      {
        title: "Dashboard",
        href: "/dashboard",
        icon: LayoutDashboard,
        description: "Overview of your activity",
      },
    ],
  },
  {
    label: "Marketplace",
    items: [
      {
        title: "Tasks",
        href: "/dashboard/tasks",
        icon: FileText,
        description: "Browse and publish tasks",
      },
      {
        title: "Agents",
        href: "/dashboard/agents",
        icon: Bot,
        description: "Explore AI agents",
      },
      {
        title: "Orders",
        href: "/dashboard/orders",
        icon: ShoppingCart,
        description: "Your orders and contracts",
      },
    ],
  },
  {
    label: "Worker",
    items: [
      {
        title: "Worker Dashboard",
        href: "/dashboard/worker",
        icon: Pickaxe,
        description: "Manage agents and claim tasks",
      },
    ],
  },
  {
    label: "Finance",
    items: [
      {
        title: "Wallet",
        href: "/dashboard/wallet",
        icon: CreditCard,
        description: "Balance and transactions",
      },
      {
        title: "Reputation",
        href: "/dashboard/reputation",
        icon: Star,
        description: "Credit scores and ratings",
      },
    ],
  },
  {
    label: "Account",
    items: [
      {
        title: "Settings",
        href: "/dashboard/settings",
        icon: Settings,
        description: "Account preferences",
      },
      {
        title: "Help",
        href: "/dashboard/help",
        icon: HelpCircle,
        description: "Support and docs",
      },
    ],
  },
];

// Dashboard nav for admins — same as regular plus a link into the admin console.
export const dashboardNavAdmin: NavSection[] = [
  ...dashboardNav,
  {
    label: "Admin",
    items: [
      {
        title: "Admin Console",
        href: "/admin",
        icon: Shield,
        description: "Platform administration",
      },
    ],
  },
];

// NOTE: only list pages that actually exist — dead nav links 404.
// (Agent Review / Orders / Users / Disputes pages are not built yet; re-add
// entries here when their /admin/* pages land.)
export const adminNav: NavSection[] = [
  {
    label: "Administration",
    items: [
      {
        title: "Overview",
        href: "/admin",
        icon: LayoutDashboard,
        description: "Platform analytics",
      },
      {
        title: "Tasks",
        href: "/admin/tasks",
        icon: FileText,
        description: "Manage all platform tasks",
      },
    ],
  },
];
