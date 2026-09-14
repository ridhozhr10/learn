# learn

[![video](assets/thumbnail.png)](https://www.youtube.com/watch?v=kzcI5F4tGiU)

My AI learning system from this video: [How I Use AI to Learn Things](https://www.youtube.com/watch?v=kzcI5F4tGiU).

This is a personal system I built for myself, shared as-is. Built as a pi configuration: the teaching philosophy encoded in a skill, a few small extensions, and agent definitions.

> This copy is a fork of [amosblomqvist/learn](https://github.com/amosblomqvist/learn), adapted to run on
> Windows with pi 0.85.1 and an already-installed Chromium-family browser (Brave). See
> [ADAPTATIONS.md](ADAPTATIONS.md) for the exact changes.

## What's in it

- `skills/teach/` — the philosophy and the process
- `skills/visualize/` — adds a correct, minimal diagram to a lesson when an idea is clearer as a picture
- `extensions/ask-user-question.ts` — the agent asks you questions through a UI popup
- `extensions/quiz.ts` — graded questions with instant feedback (✓/✗, correct answer, explanation)
- `extensions/md-log.ts` — link a markdown file to the session
- `extensions/subagent/` — spawns a child `pi` process per task (subagents); no tmux required
- `extensions/visual-tools/` — the authoring/render tools the visual makers drive (`write_*` / `edit_*` / `render_*` for Mermaid and SVG)
- `agents/` — `researcher`, `svg-maker`, `mermaid-maker`: the subagents the system delegates to

## Install

This repo **is** a `.pi` directory. From your learning project's root:

```bash
git clone https://github.com/ridhozhr10/learn .pi
```

Install the visual renderer's dependencies (Mermaid CLI + puppeteer). The Chromium download is
skipped — rendering uses a browser already installed on the machine:

```bash
cd .pi/extensions/visual-tools
PUPPETEER_SKIP_DOWNLOAD=1 npm install --omit=dev --legacy-peer-deps
```

Then open pi in that directory. (Or copy the pieces you want into your existing project config.)

## Requirements

- [pi](https://github.com/earendil-works/pi)
- **Node.js** — for the visual renderer and the bundled subagent.
- **A Chromium-family browser** for rendering diagrams: Brave, Chrome, Chromium or Edge. Brave is preferred; the first one found wins. Override the choice with the `PI_BROWSER_PATH` environment variable if it isn't auto-detected.
- **A vision-capable model** for the visual makers — they render a PNG, *look* at it, verify it against the brief and iterate, so the model that dispatches them must accept images.
- `ask-user-question` — use the copy bundled here. If your setup already has an `ask-user-question` extension, use **this** one in its place. Popups from different extensions serialize through a shared UI lock, which only works when it's the same implementation.

Subagents come from the bundled `extensions/subagent/` (a copy of pi's example extension). It spawns
a fresh `pi` process per task and needs no tmux — unlike upstream's `pi-interactive-subagents`.

## Notes

You can run the system without subagents. The main session does the teaching. You just lose the researcher (truth verification) and the generated visuals.

The visual makers publish finished PNGs into `viz/` next to the project (inside the Obsidian vault),
under unique filenames that the lesson embeds as `![[viz-…png|500]]`.

The teaching skill is written for one learner (me). Edit the skill to fit how you learn best.
