"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface RevealProps {
  children: React.ReactNode;
  className?: string;
  /** Stagger offset in ms, for revealing siblings one after another. */
  delay?: number;
}

/**
 * Fades + lifts its children into view the first time they are scrolled to.
 *
 * The landing page is long, and a page that simply exists on load reads as
 * static. Revealing on scroll gives it rhythm without an animation library.
 *
 * An element that starts at opacity-0 is invisible if the animation never
 * runs, so there are three escape hatches: `motion-reduce:` variants keep it
 * visible for anyone who asked for less motion (handled in CSS, so no JS has
 * to run at all), a missing IntersectionObserver reveals on the next tick, and
 * page.tsx carries a <noscript> rule that forces [data-reveal] visible.
 */
export function Reveal({ children, className, delay = 0 }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (typeof IntersectionObserver === "undefined") {
      const id = window.setTimeout(() => setShown(true), 0);
      return () => window.clearTimeout(id);
    }

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      data-reveal
      style={{ transitionDelay: `${delay}ms` }}
      className={cn(
        "transition-[opacity,transform] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]",
        "motion-reduce:translate-y-0 motion-reduce:opacity-100 motion-reduce:transition-none",
        shown ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0",
        className
      )}
    >
      {children}
    </div>
  );
}
