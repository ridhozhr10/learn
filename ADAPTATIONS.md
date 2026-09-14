# Local adaptations

This clone of `ridhozhr10/learn` was adapted for this machine. Upstream targets a macOS setup
with an older pi and the `interactive-subagents` extension. Nothing else was touched.

Environment: pi 0.85.1, Windows, provider `sumopod` (only provider registered), no tmux,
no Chrome, no `rsvg-convert` / ImageMagick.

## 1. Extensions — no changes needed

The extension imports (`@mariozechner/pi-coding-agent`, `@mariozechner/pi-tui`,
`@sinclair/typebox`) still work unmodified: pi's extension loader aliases all of them to the
current `@earendil-works/*` / `typebox` packages (see `getAliases()` in
`dist/core/extensions/loader.js`). `ask-user-question.ts`, `quiz.ts` and `md-log.ts` are
byte-identical to upstream.

## 2. Subagents — added pi's bundled example extension

Upstream expects `pi-interactive-subagents` (tmux-only, not on npm). Instead,
`extensions/subagent/` was copied from pi's bundled example:
`<pi>/examples/extensions/subagent/{index.ts,agents.ts}` (sample agents and workflow prompts
removed). It spawns a child `pi` process per task — no tmux, works on Windows.

Patched in `extensions/subagent/index.ts`: the default `agentScope` was changed from `"user"`
to `"both"` (three places — the Zod schema default, the description strings, and the
`params.agentScope ?? ...` fallback). Without this, `.pi/agents/*.md` would be invisible and
the `teach` skill's `subagent(agent="researcher", ...)` call would fail with "Unknown agent".

## 3. `agents/researcher.md` — frontmatter fixed

Upstream declares tools and a model that don't exist here:

```yaml
tools: web_search, web_fetch, safe_bash   # safe_bash + web_fetch were interactive-subagents-specific
model: openrouter/z-ai/glm-5.3            # no openrouter provider here
thinking: medium
system-prompt: append
auto-exit: true
```

Now:

```yaml
tools: web_search, fetch_content, bash, read
```

- `model` dropped → the subagent inherits the dispatching session's model and thinking level
  (pi's bundled subagent does this when `model` is absent).
- `thinking`, `system-prompt`, `auto-exit` dropped → they are `interactive-subagents` keys;
  pi's bundled discovery reads only `name`, `description`, `tools`, `model` and ignores the rest.
- `web_fetch` → `fetch_content`: the tool registered by the `pi-web-access` package. One body
  line was updated to match, plus a `curl` fallback note.

## 4. Web search — added `pi-web-access`

`web_search` / `fetch_content` are not in pi core. Installed project-locally so the researcher
has real web access:

```bash
pi install -l npm:pi-web-access --approve
```

Writes `.pi/settings.json` → `{"packages": ["npm:pi-web-access"]}` and installs into `.pi/npm`.
It needs no API keys (zero-config Exa MCP, keyless DuckDuckGo fallback). Optional keys go in
`~/.pi/agent/web-search.json`.

## 5. Visuals — parked in `_disabled/`

Moved out of the scanned dirs:

- `_disabled/skills/visualize/`
- `_disabled/agents/{mermaid-maker,svg-maker}.md`
- `_disabled/extensions/visual-tools/`

Two blockers, both upstream design decisions:

1. `extensions/visual-tools/index.ts` registers its six tools by calling
   `globalThis.__pi_interactive_subagents.registerToolExtension(...)` and is a no-op without
   that extension. pi's bundled subagent exposes no such hook, so the maker agents would spawn
   with `--tools write_mermaid,edit_mermaid,render_mermaid` and die on unknown tools.
2. Even with a working hook: `visual-tools/tools/_common.ts` lists only macOS Chrome paths in
   `CHROME_CANDIDATES`, and `EXTRA_PATH` joins with `":"` (POSIX) — the SVG path also needs
   `rsvg-convert` or `magick`, neither of which is installed.

Re-enabling means restoring those files, adding a Windows Chrome/Edge path (and `;` PATH
separator), installing `@mermaid-js/mermaid-cli` in `visual-tools/`, and either installing
`interactive-subagents` or rewiring registration to pi's bundled subagent.

## Verified

```
pi -p --approve --model sumopod/glm-5.1   # → skills: teach;  tools: read,bash,edit,write,
                                          #   ask_user_question,quiz,subagent,web_search,
                                          #   source_check,fetch_content,get_search_content
pi -p "Call subagent(agent=\"researcher\", ...)"   # → researcher spawned, searched, returned
```
