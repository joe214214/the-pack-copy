# Demo assets

Pre-staged artifacts for the Claude Waterloo demo. Everything here was produced by
the containerized agent through the real ThePack pipeline (publish task → agent
takes it → delivers `index.html`), not written by hand.

Open the `.html` files directly in a browser — each is self-contained (inline
CSS/JS, no network requests).

## 1. Wander landing page — the "agent builds a whole product page" artifact

| file | run | work time |
|---|---|---|
| `wander-landing_WITH-apple-skill.html` | only `apple-design` loaded | 7m05s |
| `wander-landing_NO-skill.html` | sandbox skills directory empty | 4m38s |

`TASK-BRIEF_wander-landing.txt` is the exact brief used for both.

**Do not present this pair as a skill A/B.** Measured honestly, the two runs are
equivalent: identical structure, both independently chose a black "most popular"
pricing card, and the code fingerprints match almost exactly (velocity 4/4,
spring 1/1, rubber-band 0/0, momentum projection 0/0, pointer capture 2/2 —
the baseline even used *more* letter-spacing). The colour difference (coral vs
violet) is run-to-run variation, not the skill.

The reason is simple: a marketing landing page never exercises what `apple-design`
is actually about — gesture physics — and the base model is already strong at
static page design. So use this page to show **that the agent autonomously builds a
complete, polished product page**, which is the point of the workflow talk anyway.

## 2. Kyoto sheet — the pair that *does* demonstrate the skill

| file | run |
|---|---|
| `kyoto-sheet_WITH-apple-skill.html` | only `apple-design` loaded |
| `kyoto-sheet_NO-skill.html` | no skills |

One focused interaction (a bottom sheet you drag), and the difference is large and
objective:

| | no skill | with skill |
|---|---:|---:|
| velocity tracking | 0 | 23 |
| spring | 0 | 20 |
| rubber-band resistance | 0 | 3 |
| momentum projection | 0 | 5 |
| requestAnimationFrame | 0 | 2 |

The skill version writes a real spring solver, estimates pointer velocity from a
sample history, and projects momentum on release (the WWDC formula). The baseline
uses a fixed-duration CSS transition and a class toggle. **This reads well on a
projector as a side-by-side of the two source files** — no one has to come up and
drag anything. Neither brief mentions Apple, springs, momentum, easing or
materials, so anything of that kind came from the skill.

## 3. Cadence landing pages — earlier full-page pair

`cadence-landing_NO-skill.html` / `cadence-landing_WITH-apple-skill.html`, plus
renders. Same caveat as Wander: treat as two samples of agent output, not as proof
of skill impact.

## Timing note

The task page shows the agent's own plan ticking off live while it works — budget
that wait as narration time for the workflow story rather than dead air.
