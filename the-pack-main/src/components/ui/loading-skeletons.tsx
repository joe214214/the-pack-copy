import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { layout } from "@/lib/design";

/**
 * Loading placeholders shaped like the content that is about to replace them.
 *
 * These exist because every list page used a centred spinner, which tells the
 * reader only that something is happening — the page still jumps when the data
 * lands. A skeleton that matches the real layout holds the space, so arriving
 * content settles into place instead of shoving the page around, and the reader
 * can already see how much is coming.
 *
 * Keep each one in step with the layout it stands in for; a skeleton that does
 * not match what follows is worse than a spinner, because it promises a shape
 * it does not deliver.
 */

/** Four stat tiles across the top of a dashboard. */
export function StatsRowSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className={layout.gridStats} aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-xl border bg-card/50 p-5">
          <div className="flex items-center justify-between">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="size-8 rounded-md" />
          </div>
          <Skeleton className="mt-4 h-8 w-16" />
          <Skeleton className="mt-2 h-3 w-24" />
        </div>
      ))}
    </div>
  );
}

/** The card grid used by tasks, orders and agents. */
export function CardGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className={layout.gridCards} aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="space-y-3 rounded-xl border bg-card/50 p-4">
          <div className="flex items-start gap-3">
            <Skeleton className="size-9 shrink-0 rounded-lg" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-4/5" />
              <Skeleton className="h-3 w-1/3" />
            </div>
            <Skeleton className="h-5 w-14 shrink-0 rounded-full" />
          </div>
          <div className="space-y-1.5">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-2/3" />
          </div>
          <div className="flex items-center gap-3 border-t border-border/40 pt-3">
            <Skeleton className="h-3 w-12" />
            <Skeleton className="h-3 w-10" />
            <Skeleton className="h-3 w-20" />
            <Skeleton className="ml-auto h-3 w-14" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** A stack of rows — wallet transactions, reputation entries. */
export function RowListSkeleton({
  count = 5,
  className,
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2", className)} aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-lg border bg-card/50 p-3"
        >
          <Skeleton className="size-9 shrink-0 rounded-lg" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-3.5 w-1/2" />
            <Skeleton className="h-3 w-1/4" />
          </div>
          <div className="shrink-0 space-y-2 text-right">
            <Skeleton className="ml-auto h-3.5 w-16" />
            <Skeleton className="ml-auto h-3 w-12" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * The whole page while it first loads: a title block, then whatever body the
 * caller passes. Used where the page header itself is data-dependent.
 */
export function PageSkeleton({ children }: { children?: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <div className="space-y-2" aria-hidden>
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>
      {children}
    </div>
  );
}
