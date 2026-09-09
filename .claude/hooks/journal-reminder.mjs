#!/usr/bin/env node
/**
 * SessionStart hook — nudges towards /distill when the journal has built up.
 *
 * The SessionEnd hook's output is never shown, so the reminder has to live at
 * the start of a session, where stdout is added to the context.
 *
 * Below the threshold this prints nothing at all: a reminder that appears every
 * time is a reminder nobody reads.
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const THRESHOLD = 15

function main() {
  const cwd = process.env.CLAUDE_PROJECT_DIR || process.cwd()
  const dir = join(cwd, 'docs', 'ai', 'journal')
  if (!existsSync(dir)) return

  let undistilled = 0

  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.md')) continue
    let text
    try {
      text = readFileSync(join(dir, name), 'utf8')
    } catch {
      continue
    }

    const mark = text.match(/<!--\s*distilled-through:\s*([^\s]+)\s*-->/)
    const through = mark ? mark[1] : ''

    for (const m of text.matchAll(/<!--\s*ts:([^\s]+)\s*-->/g)) {
      if (!through || m[1] > through) undistilled++
    }
  }

  if (undistilled > THRESHOLD) {
    process.stdout.write(
      `Il journal in docs/ai/journal/ ha ${undistilled} voci non ancora distillate. ` +
        `Quando ha senso, proponi /distill per promuovere i fatti stabili in ` +
        `docs/ai/STATE.md e le idee emerse in docs/ai/ROADMAP.md.\n`
    )
  }
}

try {
  main()
} catch {
  /* a reminder is never worth breaking a session start */
}
process.exit(0)
