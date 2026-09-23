# Image generation for ThePack agents — research findings

**Status:** unresolved by any free route. Recommendation is a paid image API.
**Investigated:** 2026-09-01 → 2026-09-18
**Audience:** whoever picks this up next. You were not in the original session, so
every claim below carries the evidence that produced it — commands, versions and
verbatim error text — so you can re-verify rather than trust it.

---

## 1. The problem

ThePack agents deliver real files. For image tasks they currently produce
**programmatically drawn vector art**, not AI-generated images.

Concrete example from a real job (task "10 Saber character illustrations"): the
agent built a Python venv, installed `cairosvg`, wrote `gen_saber.py`, and
rendered ten SVG→PNG files. They are genuine PNGs (90–160 KB each, uploaded and
delivered successfully) but they are **code-drawn vector graphics**, not what a
customer means by "an anime illustration".

**The goal:** an agent that generates real AI images **autonomously**, i.e. from
a headless process inside the sandbox, with no human in the loop.

**The constraint that kills most options:** it must work in a **headless /
non-interactive** mode (`claude -p`, `hermes -z`, `codex exec`). Anything that
only works when a human sits in front of a GUI is useless to us.

---

## 2. What we tried, and exactly how each one failed

### 2.1 The agent CLIs' own abilities — no image generation

Claude Code and Hermes have no image-generation tool at all. Given an image task
they do the reasonable thing and draw with code (PIL / cairosvg). Free, automatable,
but the output is vector/geometric — not photoreal or anime.

### 2.2 Gemini API with an API key — works, but images are not free

An API key from Google AI Studio is valid and lists 50 models including
`gemini-2.5-flash-image`, `gemini-3-pro-image`, `gemini-3.1-flash-image`.

Every image model returns, on the free tier:

```
You exceeded your current quota...
* Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests,
  limit: 0, model: gemini-2.5-flash-preview-image
```

**`limit: 0`** — image generation is not in the free tier at all (text is).
Tested `gemini-2.5-flash-image`, `gemini-3.1-flash-image` and `gemini-3-pro-image`;
all identical. **Enabling billing on the Google Cloud project would make this work
immediately** (the key itself is fine). Roughly $0.03–0.04 per image.

### 2.3 Gemini consumer subscription (Gemini Advanced/Pro) — no programmatic door

The chat product's internal `generate_image` tool runs inside Google's own
product. There is no official external client for the consumer subscription, so
no MCP or script can reach it. This is a product decision, not a technical limit.

### 2.4 Antigravity (Google's agentic IDE) — cannot be sandboxed

The natural idea: if Claude Code can run in the sandbox by copying its login,
why not Antigravity, which *does* generate images on the subscription?

Because Antigravity is a **GUI Electron app**, not a CLI:

- Install dir `%LOCALAPPDATA%\Programs\Antigravity` contains `Antigravity.exe`,
  `LICENSE.electron.txt`, `chromium.pak` — it is a VS Code fork.
- `resources/bin` holds only `language_server.exe` and `webm_encoder.exe`.
  **There is no CLI entry point** — nothing equivalent to `claude -p`.
- Auth is a **Chromium cookie jar**
  (`~/.gemini/antigravity-browser-profile/Default/Network/Cookies` plus
  `Login Data`), not a clean copyable token like Claude's `.credentials.json`.

A container has no display and no way to drive a GUI. Running the Linux build
under a virtual display with UI automation would be extremely fragile and is not
viable for a product.

### 2.5 Gemini CLI — Google closed this door during our investigation

`@google/gemini-cli` v0.60.0 has everything structurally needed: `-p/--prompt`
headless mode, MCP support, and OAuth sign-in with a personal Google account.

Signing in produced:

```
Authentication succeeded
Failed to sign in. Message: This client is no longer supported for Gemini Code
Assist for individuals. To continue using Gemini, please migrate to the
Antigravity suite of products: https://antigravity.google
```

**Google has removed the free individual tier from the CLI and is routing
individuals to the GUI product.** Remaining CLI auth options are API key or
Vertex AI — both paid.

### 2.6 Codex CLI — has the tool, but not in headless mode

This was the most promising lead and deserves the most detail.

**What is true:** Codex CLI (`codex-cli 0.133.0-alpha.1`, installed at
`%LOCALAPPDATA%\OpenAI\Codex\bin\<hash>\codex.exe`) **does ship a built-in
`image_gen` tool** backed by gpt-image-2. Its skill spec at
`~/.codex/skills/.system/imagegen/SKILL.md` states plainly:

> "**Default built-in tool mode (preferred):** built-in `image_gen` tool for
> normal image generation, editing, and simple transparent-image requests.
> **Does not require `OPENAI_API_KEY`.**"

Auth is the ChatGPT subscription — `~/.codex/auth.json` has
`auth_mode: "chatgpt"`, no API key, and OAuth `tokens` (id/access/refresh +
account_id), i.e. **a copyable credential exactly like Claude's**. It also has
`codex exec` for headless runs, `--dangerously-bypass-approvals-and-sandbox`,
`-C <dir>`, `--skip-git-repo-check`, `-o <file>`. On paper: perfect.

**Why it still fails for us:** the `image_gen` tool is **not exposed in
`codex exec`**. Verified four independent ways:

1. **Asked it to generate an image.** It silently fell back to drawing with PIL
   and said so:
   > "the preferred `imagegen` built-in generator **was not exposed in this
   > session**, and the CLI fallback had no `OPENAI_API_KEY`, so I produced a
   > clean local PNG…"

   (Both test images we produced this way — a red panda and a "knight" — are
   PIL-drawn vector art, which is why they look flat and geometric.)

2. **Enabled the feature flag.** `codex exec --enable image_generation` — the
   flag name is valid (other guesses like `image_gen` are rejected with
   "Unknown feature flag"), but the tool still did not appear:
   > "I can't complete this as requested because the built-in `image_gen` tool is
   > **not exposed in this session**. I checked the available tools, and **no
   > image generation tool is callable here**."

3. **Asked it to enumerate its own tools.** In `exec` it has
   `functions.view_image` (image *input*), `functions.shell_command`,
   `functions.apply_patch`, MCP resource tools, `web.run`, plugin tools — **no
   `image_gen`**.

4. **Checked the plugin catalogue.** `list_available_plugins_to_install` returns
   canva, figma, github, gmail, google-calendar, google-drive, linear, notion,
   openai-developers, outlook-*, sharepoint, slack, teams. **No image-generation
   plugin.**

> Interactive `codex` (the TUI) *can* generate images — that is not in dispute and
> was confirmed by the project owner. The split is **interactive = yes, headless =
> no**, and headless is the only mode ThePack automation can use.

Worth re-checking later: this is an **alpha** build (0.133.0-alpha.1). If OpenAI
exposes `image_gen` to `exec` in a future release, this becomes the best option
we have — free with the subscription, copyable auth, already sandbox-compatible.

### 2.7 Local Stable Diffusion — works, but wrong shape for the product

Free and automatable, and the dev machine (RTX 5070 Laptop, 8 GB VRAM) can run
SDXL/anime checkpoints comfortably. SD would run on the host and the sandboxed
agent would call it over HTTP (`host.docker.internal:7860`), so the sandbox is
preserved.

**Rejected by the project owner because ThePack is intended to be commercial:**
a local GPU does not scale, requires a machine that is always on, is
single-tenant, and cannot serve many agent owners.

### 2.8 `codex-imagegen-cli` (unofficial) — not recommended

A third-party tool that reuses the Codex/ChatGPT OAuth token to call image
endpoints directly, bypassing the CLI's tool restrictions. Technically it would
be headless and free.

**Do not ship this.** It repurposes a CLI login token as an API credential:
terms-of-service risk, can be revoked at any time, and would take the product
down with it. Fine as a personal experiment, not as product infrastructure.

---

## 3. The pattern worth understanding

Every vendor lands in the same place:

| Vendor | Image gen on the subscription | Reachable by a headless program |
|---|---|---|
| OpenAI (ChatGPT / Codex) | yes, interactive only | **no** — not exposed to `codex exec` |
| Google (Gemini / Antigravity) | yes, in the app | **no** — no CLI; free CLI tier was removed |
| Anthropic (Claude Code) | n/a | n/a — no image generation at all |

**Image generation lives in the interactive product, where the vendor keeps the
user; programmatic access is a paid product.** This is consistent and deliberate.
It is not a gap we failed to find — treat "free + automated + real AI images" as
unavailable.

---

## 4. Recommendation

**Use a paid image API.** The cost is negligible against task budgets:

| Provider | ≈ per image | Notes |
|---|---|---|
| fal.ai / Replicate (FLUX schnell) | **$0.003** | cheapest; many **anime** checkpoints, a good fit for character work |
| Replicate / fal anime SDXL | $0.005–0.01 | |
| Gemini 2.5 Flash Image | $0.03–0.04 | API key already stored in `sandbox/.env`; only needs billing enabled |
| OpenAI gpt-image-1 | $0.01–0.17 | by quality tier |

A $40 task with 10 images costs **$0.03–$0.40** — under 1% of revenue.

**Suggested architecture (fits the existing marketplace model):** the **agent
owner supplies their own image API key**, exactly as they already supply their own
Claude/Hermes login. The owner earns from the task and covers the image cost from
that; the platform fronts nothing and there is no shared quota to exhaust.

---

## 5. Where this plugs in — the work is small

The integration point already exists:

- `thepack-mcpb/src/runner.ts` is **CLI-agnostic** (`AGENT_CLI=claude|hermes`), so
  the brain and the image backend are independent concerns.
- Adding image generation = **one new MCP tool** (e.g. `generate_image(prompt,
  path)`) in `thepack-mcpb/src/server.ts` that calls whichever image API, plus its
  key passed through `sandbox/.env` → docker-compose → container, the same way
  `THEPACK_AGENT_KEY` already is.
- **The sandbox does not need to change**, and the existing delivery pipeline
  already handles images end to end (`upload_file` → `submit_image_result`;
  proven by the 10-image Saber job).

So switching providers later is a config change, not a rewrite.

---

## 6. Open questions for whoever picks this up

1. **Provider choice** — fal.ai vs Replicate vs Gemini. Compare anime-model
   quality and latency on a real prompt before committing.
2. **Who pays** — owner-supplied key (recommended above) vs platform key with the
   cost folded into the platform fee. This is a business decision with billing
   and abuse-control implications.
3. **Re-check Codex** — it is alpha software. If `image_gen` ever appears in
   `codex exec`, revisit §2.6; it would be the cheapest good answer.
4. **Commercial terms, unrelated to images but urgent** — ThePack currently reuses
   *personal* Claude/Hermes/ChatGPT subscriptions to do paid work for third
   parties. That is very likely outside consumer terms. Before launch this needs
   to move to proper API credentials or a commercial agreement. Worth confirming
   with each vendor.
