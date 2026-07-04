"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { TrendingUp, type LucideIcon } from "lucide-react";

export interface StatItem {
  title: string;
  value: string;
  change: string;
  trend?: "up" | "down" | "neutral";
  icon: LucideIcon;
  color: string;
  bgColor: string;
}

interface StatsGridProps {
  stats: StatItem[];
}

export function StatsGrid({ stats }: StatsGridProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 stagger-in">
      {stats.map((stat) => (
        <Card
          key={stat.title}
          className="group relative overflow-hidden transition-all hover:shadow-md hover:shadow-primary/5 hover:border-primary/20"
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {stat.title}
            </CardTitle>
            <div className={`rounded-md p-2 ${stat.bgColor}`}>
              <stat.icon className={`h-4 w-4 ${stat.color}`} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stat.value}</div>
            <div className="flex items-center gap-1 mt-1">
              {stat.trend === "up" && (
                <TrendingUp className="h-3 w-3 text-emerald-500" />
              )}
              <p className="text-xs text-muted-foreground">{stat.change}</p>
            </div>
          </CardContent>
          <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.02] to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
        </Card>
      ))}
    </div>
  );
}
