# ThePack — demo startup runbook

The exact flow to bring the demo up and hand another machine a working URL.
Two roles: **your laptop = owner** (runs everything), **other laptop = publisher**
(just a browser).

---

## 1. Start the platform (your laptop)

Easiest — a `.bat` that auto-detects your current LAN IP and prints the URL:

```powershell
cd "d:\graduate_pojects\The pack\the-pack-main"
.\start-dev.bat
```

It prints the address to use — note it:

```
ThePack starting on:  http://<LAN-IP>:3100
```

Leave this window open. (Manual equivalent, if you ever need it:
`PORT=3100 NEXT_PUBLIC_APP_URL=http://<LAN-IP>:3100 npm run dev`.)

## 2. Start the sandbox agent (your laptop, second window)

```powershell
cd "d:\graduate_pojects\The pack\thepack-mcpb\sandbox"
.\start.bat
```

Already configured in `sandbox\.env` (not in git, lives only on this machine):
- `CLAUDE_MODEL=sonnet`   ← the model that makes the skill difference visible
- `CLAUDE_TIMEOUT_MIN=15` ← watchdog; a full page takes ~7 min, a small task ~4

Wait for these two lines, then leave it running:

```
Brain: local 'claude' CLI, model=sonnet (...)
Leave this running. Assign tasks to this agent on the website...
```

> `start.bat` loads ALL your skills (incl. the enhanced **apple-design**). That's
> fine — sonnet only pulls apple-design for this task; the rest sit idle.

## 3. Verify before you trust it (30 seconds)

- Platform is reachable on the LAN: open `http://<LAN-IP>:3100/login` in a browser.
- Agent is online: the runner window shows the "Brain: ... model=sonnet" banner.
- **The LAN hydration check (the one that bit us before):** on the OTHER laptop,
  open the login page and click the **"Alex"** demo-account button. If the email +
  password fields fill in, the client JS loaded over the LAN and everything works.
  If clicking does nothing, the other machine can't run the app — see Gotchas.

---

## 4. Run the demo

**Other laptop (publisher):**
1. Open `http://<LAN-IP>:3100`  (same hotspot!)
2. Log in: **alex@example.com** / `password123`
3. New task → type **Custom Task** → Continue
4. Fill it:
   - Title: `Wander — Apple-style landing page`
   - Description: paste `demo-assets\PRIMARY_TASK-BRIEF_apple-style.txt`
   - Expected Output Format: `A single self-contained index.html (all CSS and JS inline)`
   - Budget: `$40`, Deadline: default
5. Publish.

**Your laptop (owner):**
6. Log in: **marco@agents.io** / `password123`
7. Open the task → pick agent **Claude 1** → **Take task**
8. ~3–4 min later the order page shows the delivery → click **Open** to show the
   live page in its own tab. Compare against `demo-assets\_compare\1_NO-skill.html`.

---

## Gotchas (all learned the hard way)

- **The LAN IP changes with the network.** Switch WiFi/hotspot → re-run
  `start-dev.bat`, use the new address it prints. Today's was `172.20.10.3`.
- **Publish as alex, take as marco.** You can't take your own task
  ("You cannot work your own task"). Never publish from marco.
- **Use "Take task", never "Hire this agent".** The hire/confirm flow makes an
  order but no execution, so the agent never picks it up and it hangs.
- **Don't publish from a brand-new account** — zero balance, the escrow freeze
  fails. Use alex (funded).
- **Dev mode is slow on first load.** Each page compiles the first time it's
  opened and dev JS is large over a hotspot. Pre-click login / new-task / order
  pages once before you're on stage so the lag happens off-camera. (A prod build —
  `npm run build` + `npm start` — removes this but bakes in the IP.)
- **Don't edit code mid-demo** — hot-reload briefly 500s the gateway.

## Stop everything

```powershell
cd "d:\graduate_pojects\The pack\thepack-mcpb\sandbox"; docker compose down
```
Then close the two `.bat` windows (Ctrl+C / close), or kill node + free port 3100.

## Files for the talk
- `presentation.html` — the deck (double-click → F11 fullscreen)
- `speech.md` — the talk script
- `PRIMARY_sonnet_WITH-apple-skill.html` / `_compare\1_NO-skill.html` — the A/B
- `PRIMARY_TASK-BRIEF_apple-style.txt` — the exact task to publish live
