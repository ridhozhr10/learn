/**
 * SVG authoring loop for the svg-maker subagent — three tools that share one
 * session-scoped source file:
 *
 *   write_svg   — write the full SVG source to the session's file
 *   edit_svg    — exact-match old_text→new_text on that file (pi-edit semantics)
 *   render_svg  — render whatever is in the file → PNG, returned inline; with
 *                 `save_as`, also publish it into <cwd>/viz
 *
 * Bundled inside the visual-tools extension and registered with pi directly —
 * the child pi process the bundled `subagent` extension spawns loads this
 * project extension, so any agent whose `tools:` frontmatter names these tools
 * (currently just svg-maker) gets them. All three names map to this one file
 * (see ../index.ts).
 *
 * Rendering tries rsvg-convert (librsvg), then ImageMagick's `magick`, then —
 * the portable default, and the only one available on this Windows box —
 * screenshots the SVG in a headless Chromium-family browser (Brave preferred;
 * see ../_common.ts `findBrowser`). No node render deps. Module-level session
 * state persists across this child process's tool calls, isolated from any
 * parallel maker.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent"
import { Type } from "@sinclair/typebox"
import { pathToFileURL } from "node:url"
import {
  applyEdit,
  existsSync,
  findBrowser,
  join,
  mkdirSync,
  publish,
  readFileSync,
  run,
  type Session,
  snippetAround,
  writeBody,
  writeFileSync,
} from "./_common.ts"

const GROUP = "svg"
const BODY_FILE = "diagram.svg"
const RENDER_TIMEOUT_MS = 60_000
const SCALE = 2

type RenderDetails = { ok: boolean; path: string; filename?: string }

let session: Session | null = null

/**
 * Read the SVG's intrinsic pixel size so the screenshot viewport matches its
 * aspect ratio (otherwise the browser letterboxes the picture). Percentage
 * sizes are ignored in favour of the viewBox. Falls back to 800x600.
 */
function svgPixelSize(svg: string): { width: number; height: number } {
  const attr = (name: string): number => {
    const m = svg.match(new RegExp(`\\b${name}\\s*=\\s*["']?\\s*([0-9.]+)\\s*(px|pt|%)?`, "i"))
    return m && m[2] !== "%" ? parseFloat(m[1]) : NaN
  }
  const vb = svg.match(/viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i)
  let width = attr("width")
  let height = attr("height")
  if (vb) {
    if (!isFinite(width)) width = parseFloat(vb[1])
    if (!isFinite(height)) height = parseFloat(vb[2])
  }
  if (!isFinite(width) || width <= 0) width = 800
  if (!isFinite(height) || height <= 0) height = 600
  return { width: Math.ceil(width), height: Math.ceil(height) }
}

/**
 * Render an SVG by screenshotting it in a headless Chromium-family browser
 * (Brave preferred). The SVG is inlined into a tiny HTML page and stretched to
 * fill the viewport, which is set to the SVG's own aspect ratio times SCALE, so
 * the result is a crisp, exact-size, white-background raster.
 */
async function renderSvgWithBrowser(svgPath: string, outPath: string, workDir: string) {
  const browser = findBrowser()
  if (!browser) {
    return {
      ok: false as const,
      res: {
        code: null,
        stdout: "",
        stderr: "No Chromium-family browser found. Install Brave, or set PI_BROWSER_PATH to one.",
        timedOut: false,
      },
    }
  }
  const svg = readFileSync(svgPath, "utf8")
  const { width, height } = svgPixelSize(svg)
  const html =
    `<!doctype html><html><head><meta charset="utf-8"><style>\n` +
    `html,body{margin:0;padding:0;background:#fff}\n` +
    `svg{display:block;width:100vw;height:100vh}\n` +
    `</style></head><body>\n${svg}\n</body></html>`
  const htmlPath = join(workDir, `svg-${Date.now()}.html`)
  writeFileSync(htmlPath, html, "utf8")
  const res = await run(
    browser,
    [
      "--headless=new",
      "--disable-gpu",
      "--hide-scrollbars",
      `--window-size=${width * SCALE},${height * SCALE}`,
      `--screenshot=${outPath}`,
      pathToFileURL(htmlPath).href,
    ],
    { cwd: workDir, timeoutMs: RENDER_TIMEOUT_MS },
  )
  if (res.code === 0 && existsSync(outPath)) return { ok: true as const, res }
  return { ok: false as const, res }
}

/**
 * Render an SVG file to PNG. Tries rsvg-convert, then ImageMagick, then the
 * headless browser (the portable path used on Windows).
 */
async function renderSvg(svgPath: string, outPath: string, workDir: string) {
  // 1. rsvg-convert (librsvg — good system-font handling); -z SCALE for crispness.
  const rsvgRes = await run("rsvg-convert", ["-z", String(SCALE), svgPath, "-o", outPath], {
    cwd: workDir,
    timeoutMs: RENDER_TIMEOUT_MS,
  })
  if (rsvgRes.code === 0 && existsSync(outPath)) return { ok: true as const, res: rsvgRes }
  // 2. ImageMagick — -density 192 (~2x of 96dpi) for a crisp raster.
  const magick = await run("magick", ["-density", "192", "-background", "white", svgPath, outPath], {
    cwd: workDir,
    timeoutMs: RENDER_TIMEOUT_MS,
  })
  if (magick.code === 0 && existsSync(outPath)) return { ok: true as const, res: magick }
  // 3. Headless browser (Brave/Chrome/Edge) — always available here.
  const viaBrowser = await renderSvgWithBrowser(svgPath, outPath, workDir)
  if (viaBrowser.ok) return viaBrowser
  return { ok: false as const, res: viaBrowser.res.code !== null ? viaBrowser.res : rsvgRes }
}

export default function svgToolsExtension(pi: ExtensionAPI) {
  // ── write_svg ──────────────────────────────────────────────────────────────
  pi.registerTool({
    name: "write_svg",
    label: "Write SVG",
    description:
      "Write the FULL SVG source to this session's managed file (your first draft " +
      "or a complete rewrite). You do NOT name the file — edit_svg and render_svg " +
      "act on the same one.\n\n" +
      "`source` is a complete `<svg ...>…</svg>` document with an explicit width/" +
      "height (or viewBox), readable font sizes, and a light or transparent " +
      "background. Writing does NOT render — call render_svg when ready. For a " +
      "small fix, prefer edit_svg over rewriting.",
    parameters: Type.Object({
      source: Type.String({ description: "The complete SVG document, from `<svg` to `</svg>`." }),
    }),
    async execute(_id, params) {
      const source = (params.source ?? "").trim()
      if (!source) throw new Error("`write_svg` requires a non-empty `source`.")
      if (!source.includes("<svg")) throw new Error("`write_svg`: source must be a complete <svg>…</svg> document.")
      session = writeBody(GROUP, BODY_FILE, source)
      const lines = source.split("\n").length
      return {
        content: [
          { type: "text", text: `Wrote ${lines}-line SVG source.\nCall render_svg to render it, or edit_svg to tweak it.` },
        ],
        details: { ok: true, path: session.bodyPath, lines },
      }
    },
  })

  // ── edit_svg ───────────────────────────────────────────────────────────────
  pi.registerTool({
    name: "edit_svg",
    label: "Edit SVG",
    description:
      "Make a single exact-match replacement in this session's SVG source — the " +
      "same contract as pi's built-in edit, locked to the one managed file. " +
      "`old_text` must appear EXACTLY ONCE (include surrounding context for " +
      "uniqueness); on 0 or >1 matches the call fails and nothing changes. Call " +
      "write_svg first. Editing does NOT render.",
    parameters: Type.Object({
      old_text: Type.String({ description: "Exact substring of the current source to replace (must match once)." }),
      new_text: Type.String({ description: "Replacement text for `old_text`." }),
    }),
    async execute(_id, params) {
      if (!session || !existsSync(session.bodyPath)) {
        throw new Error("edit_svg: no source yet — call write_svg first.")
      }
      const current = readFileSync(session.bodyPath, "utf8")
      const { updated, index } = applyEdit(current, String(params.old_text ?? ""), String(params.new_text ?? ""))
      writeFileSync(session.bodyPath, updated, "utf8")
      return {
        content: [
          { type: "text", text: "Applied edit. Updated region:\n```\n" + snippetAround(updated, index) + "\n```\nCall render_svg to see it." },
        ],
        details: { ok: true, path: session.bodyPath },
      }
    },
  })

  // ── render_svg ─────────────────────────────────────────────────────────────
  pi.registerTool({
    name: "render_svg",
    label: "Render SVG",
    description:
      "Render the CURRENT session SVG source to a PNG and return it inline so you " +
      "can SEE the picture and iterate. You do NOT pass the source here — it comes " +
      "from the managed file; call write_svg first.\n\n" +
      "Iterate freely with no `save_as` (preview only). When the picture is " +
      "correct and clean, call once more with `save_as` set to a short kebab-case " +
      "topic slug: that publishes the PNG into <cwd>/viz with a unique " +
      "filename and returns the filename to embed. On a render error this returns " +
      "the error text instead of an image — fix with edit_svg and re-render.",
    parameters: Type.Object({
      save_as: Type.Optional(
        Type.String({
          description:
            "Short kebab-case topic slug (e.g. 'number-line'). When set, the " +
            "rendered PNG is published to <cwd>/viz as viz-<slug>-<timestamp>.png " +
            "and the filename is returned. Omit for a preview-only render.",
        }),
      ),
    }),
    async execute(_id, params) {
      if (!session || !existsSync(session.bodyPath)) {
        throw new Error("render_svg: no source yet — call write_svg first.")
      }
      const { workDir, bodyPath } = session
      mkdirSync(workDir, { recursive: true })

      const outPath = join(workDir, `render-${Date.now()}.png`)
      const { ok, res } = await renderSvg(bodyPath, outPath, workDir)

      if (!ok) {
        const detail = (res.stderr || res.stdout || "unknown error").split("\n").slice(-30).join("\n")
        const note = res.timedOut ? "SVG render timed out.\n\n" : ""
        return {
          content: [
            {
              type: "text",
              text: `${note}SVG render FAILED — no image produced (tried rsvg-convert, magick, then a headless browser). Fix the source with edit_svg and call render_svg again.\n\nError:\n${detail}`,
            },
          ],
          details: { ok: false, path: "" } as RenderDetails,
        }
      }

      const data = readFileSync(outPath).toString("base64")
      const content: Array<{ type: "text"; text: string } | { type: "image"; data: string; mimeType: string }> = []

      if (params.save_as) {
        const { filename, path } = publish(outPath, String(params.save_as))
        content.push({
          type: "text",
          text: `Published to viz/.\nfilename: ${filename}\npath: ${path}\n\nLOOK at the picture below to confirm the geometry is correct before returning it.`,
        })
        content.push({ type: "image", data, mimeType: "image/png" })
        return { content, details: { ok: true, path, filename } as RenderDetails }
      }

      content.push({
        type: "text",
        text: "Preview render (not yet saved). LOOK: are coordinates, angles, directions, and proportions correct? Labels clear and unclipped? Fix with edit_svg, or re-render with `save_as` to publish.",
      })
      content.push({ type: "image", data, mimeType: "image/png" })
      return { content, details: { ok: true, path: outPath } as RenderDetails }
    },
  })
}
