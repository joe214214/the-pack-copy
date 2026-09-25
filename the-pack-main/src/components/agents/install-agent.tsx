"use client";

import { useState, useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { BRAIN_INFO, BRAINS, type Brain, type Platform } from "@/lib/installer/brains";
import { Download, Check, Monitor, Apple, Terminal } from "lucide-react";

/**
 * Lets an agent owner download a ready-to-run installer.
 *
 * This replaced a block that printed the agent's live API key into the page and
 * asked the owner to copy it into a command. Two problems with that: the key sat
 * in the DOM of a page people screenshot, and pasting a key into a config file
 * was the step that went wrong most often. Now the key is only ever inside the
 * downloaded file.
 *
 * Choosing a brain is a real choice, so it is presented as one: each option
 * states the subscription it needs and what it costs to download. A customer
 * only pulls the image for the brain they pick — all three in one image measured
 * 6.75GB against 1.7GB for Claude alone.
 */
export function InstallAgent({
  agentSlug,
  className,
}: {
  agentSlug: string;
  className?: string;
}) {
  const [brain, setBrain] = useState<Brain>("claude");
  const [chosenPlatform, setChosenPlatform] = useState<Platform | null>(null);
  const [downloaded, setDownloaded] = useState(false);

  // Which OS they are browsing from, as a starting guess. Read through
  // useSyncExternalStore rather than an effect: the server has no navigator, and
  // this is exactly the "value that lives outside React" case the hook exists
  // for — it gives a server snapshot and a client snapshot without a
  // setState-in-effect or a hydration mismatch.
  const detected = useSyncExternalStore<Platform>(
    () => () => {},
    () => (/windows/i.test(navigator.userAgent) ? "windows" : "unix"),
    () => "unix"
  );

  // The guess is only a default: the machine that will run the agent is often
  // not the one they are browsing from.
  const platform = chosenPlatform ?? detected;
  const setPlatform = setChosenPlatform;

  const info = BRAIN_INFO[brain];
  const href = `/api/agents/${agentSlug}/installer?brain=${brain}&platform=${platform}`;

  return (
    <div className={cn(
        // Container query, not a viewport breakpoint: this sits inside an agent
        // card that is about half the page wide, so sm: put three options into
        // ~140px each and wrapped every label onto two lines.
        "@container space-y-4 rounded-lg border bg-muted/30 p-4",
        className
      )}>
      <div>
        <h3 className="text-sm font-semibold">Run this agent</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Pick the AI subscription you already pay for. The installer comes with
          your key already in it — download it and run it, nothing to configure.
        </p>
      </div>

      {/* Brain */}
      <div className="space-y-2">
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Which AI runs the work
        </p>
        <div className="grid gap-2 @md:grid-cols-3">
          {BRAINS.map((b) => {
            const bi = BRAIN_INFO[b];
            const active = b === brain;
            return (
              <button
                key={b}
                type="button"
                onClick={() => setBrain(b)}
                aria-pressed={active}
                className={cn(
                  "rounded-lg border p-2.5 text-left transition-colors",
                  active
                    ? "border-primary bg-primary/10"
                    : "border-border hover:border-primary/30"
                )}
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs font-medium">{bi.label}</span>
                  {bi.recommended && (
                    <span className="rounded bg-emerald-500/15 px-1 py-0.5 text-[9px] font-medium text-emerald-400">
                      suggested
                    </span>
                  )}
                </div>
                <p className="mt-1 text-[10px] leading-snug text-muted-foreground">
                  Needs {bi.subscription}
                </p>
                <p className="mt-0.5 text-[10px] text-muted-foreground/70">
                  {bi.approxImageSize} download
                </p>
              </button>
            );
          })}
        </div>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          {info.note}
        </p>
      </div>

      {/* Platform */}
      <div className="space-y-2">
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          The computer that will run it
        </p>
        <div className="flex gap-2">
          {(
            [
              { id: "unix" as Platform, label: "macOS / Linux", icon: Apple },
              { id: "windows" as Platform, label: "Windows", icon: Monitor },
            ]
          ).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setPlatform(id)}
              aria-pressed={platform === id}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors",
                platform === id
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:border-primary/30"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      <Button
        className="glow-sm w-full"
        size="sm"
        render={
          <a
            href={href}
            download
            onClick={() => setDownloaded(true)}
          />
        }
      >
        {downloaded ? (
          <Check className="mr-1.5 h-3.5 w-3.5" />
        ) : (
          <Download className="mr-1.5 h-3.5 w-3.5" />
        )}
        Download installer
      </Button>

      {/* Two prerequisites, stated before they hit them rather than after. */}
      <div className="space-y-1.5 border-t border-border/60 pt-3 text-[11px] text-muted-foreground">
        <p className="flex items-start gap-1.5">
          <Terminal className="mt-0.5 h-3 w-3 shrink-0" />
          <span>
            {info.signInHint} The installer copies that login into the
            container — it never asks for an API key.
          </span>
        </p>
        <p className="flex items-start gap-1.5">
          <Monitor className="mt-0.5 h-3 w-3 shrink-0" />
          <span>
            Docker Desktop must be installed and running.{" "}
            {platform === "windows" && "On Windows it will ask to enable WSL2 — accept."}
          </span>
        </p>
      </div>
    </div>
  );
}
