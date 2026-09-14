/**
 * visual-tools
 *
 * Registers the six authoring tools used by the visual maker subagents:
 *
 *   • write_mermaid / edit_mermaid / render_mermaid
 *       (tools/mermaid_tools.ts) — the mermaid-maker's authoring loop: write a
 *       Mermaid source, exact-match edit it, render whatever is currently in
 *       the managed file to a PNG (via the bundled @mermaid-js/mermaid-cli and
 *       an installed Chromium-family browser), return the PNG inline for
 *       inspection, and — when given `save_as` — publish it into <cwd>/viz with
 *       a unique name.
 *   • write_svg / edit_svg / render_svg
 *       (tools/svg_tools.ts) — the svg-maker's authoring loop: same shape, but
 *       renders hand-written SVG to a PNG by screenshotting it in the same
 *       headless browser (falling back to rsvg-convert / ImageMagick if the
 *       browser is unavailable).
 *
 * ── Why this registers with pi directly (not interactive-subagents) ──────────
 * Upstream targeted the `interactive-subagents` extension, whose
 * `registerToolExtension` hook let it expose these tools ONLY to child
 * subagents. This machine uses pi's bundled `subagent` extension instead
 * (see ../../ADAPTATIONS.md): it spawns an ordinary child `pi` process — no
 * `--no-extensions`, so the child discovers and loads this project extension
 * like any other. Registering the tools with pi directly is therefore enough,
 * and the `--tools write_mermaid,edit_mermaid,render_mermaid,read` line in the
 * maker agents' frontmatter resolves against them.
 *
 * Consequence: the six tools are also visible to the MAIN session. That is
 * harmless — the `visualize` skill still instructs the teacher to delegate —
 * and it is the price of using pi's bundled subagent, which has no per-agent
 * tool-visibility hook.
 *
 * Rendering is Chromium-based on every platform: Brave is preferred, with
 * Chrome / Chromium / Edge as fallbacks (see tools/_common.ts `findBrowser`).
 * No rsvg-convert or ImageMagick is required on Windows.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent"
import mermaidTools from "./tools/mermaid_tools.ts"
import svgTools from "./tools/svg_tools.ts"

export default function visualTools(pi: ExtensionAPI) {
  mermaidTools(pi)
  svgTools(pi)
}
