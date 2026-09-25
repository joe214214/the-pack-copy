import { INSTALL_SH_TEMPLATE } from "./install-sh";
import { INSTALL_PS1_TEMPLATE } from "./install-ps1";
import type { Brain, Platform } from "./brains";

/**
 * Builds the personalised installer an agent owner downloads.
 *
 * The whole point is that nothing is left for the customer to configure: the
 * key, the server address and the chosen brain are already in the file, so
 * installing is one download and one run. That also removes the step people got
 * wrong most often — editing a .env in a text editor.
 *
 * Server-only: it pulls in the installer templates, which must never reach a
 * browser bundle. The brain metadata the dashboard needs lives in ./brains.ts.
 */

/**
 * Where the published images live. Set AGENT_IMAGE_REPO to the registry path
 * (e.g. ghcr.io/acme/thepack-agent) and AGENT_IMAGE_VERSION to the release the
 * installers should pin.
 *
 * The version is pinned rather than floating so a customer's agent never
 * changes under them; upgrading is a deliberate act of downloading a newer
 * installer. Falling back to the moving tag keeps a pre-release setup working.
 */
function imageFor(brain: Brain): string {
  const repo = process.env.AGENT_IMAGE_REPO || "ghcr.io/joe214214/thepack-agent";
  const version = (process.env.AGENT_IMAGE_VERSION || "").trim();
  return version ? `${repo}:${brain}-${version}` : `${repo}:${brain}`;
}

interface RenderOptions {
  agentKey: string;
  agentName: string;
  brain: Brain;
  platform: Platform;
  serverUrl: string;
}

export function renderInstaller({
  agentKey,
  agentName,
  brain,
  platform,
  serverUrl,
}: RenderOptions): { filename: string; contentType: string; body: string } {
  const template =
    platform === "windows" ? INSTALL_PS1_TEMPLATE : INSTALL_SH_TEMPLATE;

  // The name is interpolated into a quoted shell/PowerShell string, so strip
  // the characters that could close that quote or start a substitution.
  const safeName = agentName.replace(/['"\\`$]/g, "").slice(0, 60) || "Agent";

  const body = template
    .replaceAll("{{AGENT_KEY}}", agentKey)
    .replaceAll("{{SERVER_URL}}", serverUrl.replace(/\/$/, ""))
    .replaceAll("{{AGENT_CLI}}", brain)
    .replaceAll("{{AGENT_NAME}}", safeName)
    .replaceAll("{{IMAGE}}", imageFor(brain));

  return {
    filename:
      platform === "windows"
        ? "install-thepack-agent.ps1"
        : "install-thepack-agent.sh",
    // text/plain so the browser saves it rather than trying to display or run it.
    contentType: "text/plain; charset=utf-8",
    body,
  };
}
