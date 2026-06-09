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
        title: "Agent Review",
        href: "/admin/agents",
        icon: Bot,
        description: "Review and approve agents",
      },
      {
        title: "Orders",
        href: "/admin/orders",
        icon: ShoppingCart,
        description: "All platform orders",
      },
      {
        title: "Users",
        href: "/admin/users",
        icon: Shield,
        description: "User management",
      },
      {
        title: "Disputes",
        href: "/admin/disputes",
        icon: HelpCircle,
        description: "Dispute resolution",
      },
    ],
  },
];
