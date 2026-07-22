# Demo assets

Pre-staged artifacts for the Claude Waterloo demo. Everything here was produced by
the containerized agent through the real ThePack pipeline (publish task → agent
takes it → delivers `index.html`), not written by hand.

Open the `.html` files directly in a browser — each is self-contained (inline
CSS/JS, no network requests).

---

## ⭐ PRIMARY — use this pair on stage

`PRIMARY_TASK-BRIEF_apple-style.txt` is the **exact** brief used for both runs. It
lists the sections to include and asks for "Apple's design language" — nothing
about springs, easing, tracking, materials or accessibility.

| file | model | skills |
|---|---|---|
| `PRIMARY_sonnet_NO-skill.html` | sonnet | none |
| `PRIMARY_sonnet_WITH-apple-skill.html` | sonnet | only `apple-design` |

Work time: 3m18s vs 3m43s.

**What differs, and why it is defensible:**

| | no skill | with skill |
|---|---|---|
| canvas | dark theme — the stock "dark = premium" read of *Apple* | light canvas with grey section bands, as apple.com actually does |
| CTA | two filled buttons | blue pill **+ text link with a chevron** — Apple's real pattern |
| destinations row | **5th card clipped off-screen (layout bug)** | all five fit |
| `letter-spacing` | 6 | 11 |
| `cubic-bezier` custom easing | 0 | 3 |
| `prefers-reduced-motion` | 0 | **1** |

`prefers-reduced-motion` is the strongest single point: accessible motion
degradation is an explicit section of the skill, and only the skill run implemented
it. That is knowledge arriving from the skill, not a matter of taste.

**Why sonnet:** on a top-tier model the skill barely shows — the model already
designs well on its own, so there is nothing left to add (see the `wander-landing_*`
pair below, which came out equivalent). Dropping to sonnet leaves room for the
skill's knowledge to be visible. Say this plainly if asked; it is the honest and
more interesting version of the story.

---

## Secondary — the agent builds a whole product page (opus)

`wander-landing_WITH-apple-skill.html` / `wander-landing_NO-skill.html`
(+ renders), brief in `TASK-BRIEF_wander-landing.txt`. Work time 7m05s / 4m38s.

**Do not present this pair as a skill A/B.** The two runs came out equivalent:
identical structure, both independently chose a black "most popular" pricing card,
and fingerprints match almost exactly (velocity 4/4, spring 1/1, rubber-band 0/0,
pointer capture 2/2; the baseline even used *more* letter-spacing). The colour
difference is run-to-run variation. Use it only to show that the agent
autonomously produces a complete, polished product page.

## Backup — where the skill's effect is largest

`kyoto-sheet_WITH-apple-skill.html` / `kyoto-sheet_NO-skill.html` — one focused
drag interaction, run on opus:

| | no skill | with skill |
|---|---:|---:|
| velocity tracking | 0 | 23 |
| spring | 0 | 20 |
| rubber-band | 0 | 3 |
| momentum projection | 0 | 5 |

The skill version writes a real spring solver and projects momentum on release; the
baseline uses a fixed CSS transition. Reads well as a **side-by-side of the two
source files** on a projector — nobody has to come up and drag anything.

`cadence-landing_*` — an earlier full-page pair; same caveat as Wander.

---

## Switching the agent's model

`CLAUDE_MODEL` in `thepack-mcpb/sandbox/.env` (`opus` | `sonnet` | `fable` | a full
model name; empty = account default). The runner prints the model it is using at
startup:

```
Brain: local 'claude' CLI, model=sonnet (...)
```

## Timing note

The task page shows the agent's own plan ticking off live while it works — budget
that wait as narration time for the workflow story rather than dead air.
