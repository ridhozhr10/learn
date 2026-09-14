# Local adaptations

This clone of `ridhozhr10/learn` was adapted for this machine. Upstream targets a macOS setup
with an older pi and the `interactive-subagents` extension. Nothing else was touched.

Environment: pi 0.85.1, Windows, provider `sumopod` (only provider registered), no tmux,
no Chrome (Brave is installed and used for rendering), no `rsvg-convert` / ImageMagick.

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

## 5. Visuals — re-enabled, rendering via Brave

Restored to the scanned dirs:

- `skills/visualize/`
- `agents/{mermaid-maker,svg-maker}.md`
- `extensions/visual-tools/`

Two upstream blockers were fixed:

1. **Registration.** `extensions/visual-tools/index.ts` no longer talks to
   `globalThis.__pi_interactive_subagents`; it registers the six tools with pi directly
   (`mermaidTools(pi); svgTools(pi)`). pi's bundled `subagent` spawns an ordinary child `pi`
   (no `--no-extensions`), which discovers and loads this project extension — so the
   `--tools write_mermaid,edit_mermaid,render_mermaid,read` line in the maker frontmatter
   resolves. Side effect: the six tools are also visible to the main session; harmless, since
   the `visualize` skill still delegates to a maker.
2. **Rendering on Windows.** `tools/_common.ts`:
   - `EXTRA_PATH` is empty on win32 and PATH is joined with `path.delimiter` (was a hard-coded
     POSIX `:` list of MacPorts/Homebrew dirs).
   - `findChrome()` → `findBrowser()`: Brave first
     (`C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe`, plus the
     Program Files (x86) and `%LOCALAPPDATA%` variants), then Chrome / Chromium / Edge, then
     the macOS paths. Override with `PI_BROWSER_PATH`.

   `tools/mermaid_tools.ts` spawns mmdc's real entry
   (`node_modules/@mermaid-js/mermaid-cli/src/cli.js`) with `process.execPath` instead of the
   POSIX `node_modules/.bin/mmdc` shim, and points puppeteer at the discovered browser.

   `tools/svg_tools.ts` renders by screenshotting the SVG in the same headless browser — the
   SVG is inlined into a tiny HTML page stretched to the viewport, and the viewport is set to
   the SVG's own aspect ratio at 2x — falling back to `rsvg-convert` then `magick` if either is
   present. No system tools needed on Windows.

Dependencies (not committed; `node_modules/` is ignored):

```bash
cd .pi/extensions/visual-tools
PUPPETEER_SKIP_DOWNLOAD=1 npm install --omit=dev --legacy-peer-deps
```

`puppeteer` is an explicit dependency (upstream only declares it as a peer of mermaid-cli) and
is installed with its Chromium download disabled — Brave is used instead.

Also fixed `package.json` (the upstream devDependency pointed at `/Users/amos/...`) and the
maker frontmatter (dropped the upstream `model: anthropic/claude-sonnet-5` — there is no
anthropic provider here, so the maker now inherits the dispatching model, which must be
vision-capable so it can inspect its own renders; dropped `thinking`/`system-prompt`/`auto-exit`,
which the bundled subagent ignores).

## Verified

```
# research (unchanged)
pi -p --approve --model sumopod/glm-5.1   # → skills: teach;  tools: read,bash,edit,write,
                                          #   ask_user_question,quiz,subagent,web_search,
                                          #   source_check,fetch_content,get_search_content
pi -p "Call subagent(agent=\"researcher\", ...)"   # → researcher spawned, searched, returned

# visuals re-enabled (child pi loads visual-tools; mmdc + Brave render)
pi -p --approve --model sumopod/claude-haiku-4-5 \
  "subagent(agent=\"mermaid-maker\", task=\"graph TD: packet → ordering/retransmit → reliable-stream\")"
  # → viz/viz-packet-reliable-stream-*.png   754x556
pi -p --approve --model sumopod/claude-haiku-4-5 \
  "subagent(agent=\"svg-maker\", task=\"3-4-5 right triangle, label sides, mark right angle\")"
  # → viz/viz-right-triangle-3-4-5-*.png     800x700
```
