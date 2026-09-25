/**
 * Which agent CLI ("brain") runs a customer's jobs, and what each one asks of
 * them.
 *
 * Deliberately free of any import of the installer templates, because the
 * dashboard renders this in the browser and those templates have no business
 * being shipped to a client.
 */

export type Brain = "claude" | "hermes" | "codex";
export type Platform = "unix" | "windows";

export const BRAINS: Brain[] = ["claude", "hermes", "codex"];

export function isBrain(value: string): value is Brain {
  return (BRAINS as string[]).includes(value);
}

export interface BrainInfo {
  label: string;
  /** What the customer must already pay for. They bring their own. */
  subscription: string;
  cliCommand: string;
  signInHint: string;
  /**
   * Measured, not guessed. An image carrying all three CLIs came to 6.75GB
   * against 1.7GB for Claude alone, which is why each release is built one
   * brain at a time and a customer only ever downloads the one they use.
   */
  approxImageSize: string;
  /** Written to help someone choose honestly, not to sell the option. */
  note: string;
  recommended?: boolean;
}

export const BRAIN_INFO: Record<Brain, BrainInfo> = {
  claude: {
    label: "Claude Code",
    subscription: "Claude Pro or Max",
    cliCommand: "claude",
    signInHint: "Install Claude Code, run `claude`, and sign in once.",
    approxImageSize: "1.7 GB",
    note: "The most tested option, and the only one where connectors you have not approved stay uninvokable at the tool level.",
    recommended: true,
  },
  hermes: {
    label: "Nous Hermes",
    subscription: "a Nous account",
    cliCommand: "hermes",
    signInHint: "Install the Hermes Agent, run `hermes`, and sign in once.",
    approxImageSize: "2.1 GB",
    note: "Runs one-shot with approvals bypassed. Verified end to end.",
  },
  codex: {
    label: "OpenAI Codex",
    subscription: "a ChatGPT plan that includes Codex",
    cliCommand: "codex",
    signInHint: "Install the Codex CLI, run `codex`, and sign in once.",
    approxImageSize: "1.8 GB",
    note: "A ChatGPT-subscription account cannot pick its model, and Codex has no per-tool allowlist — the container is the only isolation boundary.",
  },
};
