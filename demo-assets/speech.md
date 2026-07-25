# ThePack — talk script (~8–9 min, casual)

> Club vibe, not a board meeting. Talk like you'd explain it to a friend.
> [brackets] = what's on screen / what to do. Say the **bold** lines like you mean them.

---

## PART 1 — What we built (get everyone on board fast)

[Deck: hero — "Rent an agent. And the skills it carries."]

Hey everyone. Quick question to start — how many of you have hired a freelancer online?
[pause, hands] Cool. Now imagine that freelancer isn't a person… it's an AI agent. That's the one-line version of what we built. It's called **ThePack** — a marketplace where you rent an AI agent to do your work.

But here's the part that actually makes it interesting. When you rent the agent, **you also rent the skills it carries.** Two things change hands, not one.

[Deck: "Two things change hands"]

Think of it like this. The **agent** is the labor — it's somebody's Claude Code agent, already set up, and you just hand it a job and it runs the whole thing start to finish. And the **skills** are the expertise — whatever that agent's owner has taught it. A design system, a brand voice, some domain know-how. You're not renting raw AI output. You're renting an agent that actually knows how to do the thing.

So how does a job actually run? Dead simple.

[Deck: "From a task to a delivery"]

You post a task — "I need a landing page," whatever. Someone's agent picks it up automatically. Then it goes off and does the work **completely on its own**, inside a sealed sandbox — and this part matters for trust: that box borrows the owner's Claude login but **never their keys**, and the owner decides exactly what it's allowed to touch. Then it hands back a real file — an actual web page you can open, not a wall of text. And the whole time, you're watching its to-do list tick off live. No black box.

**The moment the job gets picked up, nobody touches it again. It just… does it.**

Okay — but the real magic is the skills. Let me show you why.

[Deck: "Same task. Same model. One variable."]

We ran an experiment. Same exact request — "build me a landing page in Apple's design language." Same AI model. We ran it twice. The **only** difference: one time the agent had a design skill loaded, one time it didn't.

[point at the two screens — left dark, right light]

Without the skill? The model's best guess at "Apple" — it went dark, kind of generic, one of the cards literally fell off the screen. With the skill? **The real thing.** Light and clean like actual apple.com, the little blue button-plus-arrow-link Apple always uses, the floating product panel, even proper accessibility for motion — and nobody told it to do any of that. The skill did.

**That's the whole pitch. The skill is the thing you're renting. Same model — different expert.**

[beat] So that's the product. Now let me tell you the part I actually geek out about — how we *built* this thing.

---

## PART 2 — How we built it with Claude Code

[Deck: big "02 — How we actually shipped it"]

So full disclosure — this whole thing was built by two people, with Claude Code, over a bunch of late nights. And honestly? The AI model is not the interesting part. Everybody's got the same model. What made it actually *work* instead of turning into a pile of impressive-looking code that doesn't run — was the habits. The way we work with it. Let me give you the loop.

[Deck: the 5-step loop]

**One — plan before you code.** Every single task, the first thing Claude does is write the to-do list, and we agree on it *before* it writes a line. Then it does them one at a time. Sounds obvious, but it's the difference between "done" and "half of six things are broken."

**Two — discuss, then build.** We don't just fire off "go build X." For anything real, we talk it through first — here are the options, here are the trade-offs — Claude even writes a little "let's just discuss this, don't build yet" note. *Then* it builds the thing we agreed on. Treat it like a teammate, not a vending machine.

**Three — and this is the one I'd tattoo on people — edit the right spot.** Don't let it re-read your entire codebase every time it changes something. That's slow, it's expensive, and it edits the wrong place. **Know your own architecture.** If you know where things live, you point it straight at the exact file, the exact region — "change this, right here." It's faster, it's cheaper, and it doesn't wander off breaking things three files away.

**Four — prove it, don't claim it.** Before anything counts as done, it actually runs the thing, reads the logs, looks at the result — and it tells us the truth, including "yeah, this is still broken." That habit alone caught, like, six bugs that would've blown up on stage tonight.

**Five — write down every single step.** Add something, delete something, change something — it all goes into one running log. So the next day, or the other person, picks up cold and knows exactly what happened. **That log is the thing that turns two people hacking into an actual team.**

[Deck: two rules]

And two rules we never bend. One — **standing rules it never breaks.** Stuff like "never push to git unless I say so" lives in its memory and holds across every session. Two — **park it, don't sneak it in.** Good idea that's not for today? It goes in a backlog note, not quietly into the code. Keeps the scope honest.

[Deck: closing line]

So that's it. The pitch is: **rent the agent, and you rent everything it's learned to do.** And the fun part — the way we built it is the exact same way it works best. Plan it, talk it through, edit with precision, prove it, write it down.

Thanks — happy to show it running live, or take questions.

---

### If you're running short on time — the 60-second cut
"We built a marketplace where you rent an AI agent to do a task — and you rent the skills it carries with it. Post a job, someone's agent picks it up, does it alone in a sealed sandbox, hands back a real file. Same model plus the right skill = a way more expert result — we'll show you. And we built the whole thing with Claude Code using five habits: plan first, discuss before building, edit the exact right spot, prove it works, and log every change. That last part is what makes it a team instead of a mess."
