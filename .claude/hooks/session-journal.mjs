#!/usr/bin/env node
/**
 * SessionEnd hook — appends one entry per session to docs/ai/journal/YYYY-MM.md.
 *
 * The hook runs after the session is over, so it can record *what* happened but
 * not *why*. The why comes from docs/ai/journal/.notes, which the model appends
 * to during the session (see the rule in CLAUDE.md); this hook folds those lines
 * into the entry and empties the file.
 *
 * Sessions that touched nothing and left no notes write nothing at all — that is
 * what keeps the journal free of noise.
 *
 * Every failure path exits 0 in silence: a broken hook must never disturb the
 * end of a session.
 */

import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, resolve, relative } from 'node:path'
import { homedir } from 'node:os'
import { execFileSync } from 'node:child_process'

const MAX_INTENT = 200
const MAX_FILES_LISTED = 6

function readStdin() {
  try {
    return JSON.parse(readFileSync(0, 'utf8') || '{}')
  } catch {
    return {}
  }
}

/**
 * Transcripts live at ~/.claude/projects/<encoded-cwd>/<session_id>.jsonl.
 * `transcript_path` is not present in every host's payload, so fall back to
 * reconstructing the path from the session id.
 */
function findTranscript(input, cwd) {
  if (input.transcript_path && existsSync(input.transcript_path)) return input.transcript_path
  const id = input.session_id ?? input.conversation_id
  if (!id) return null
  // Claude Code flattens the project path into a directory name by turning
  // every separator, colon *and dot* into a dash:
  // C:\GitHub\lelettricaleoni.com -> C--GitHub-lelettricaleoni-com
  const encoded = resolve(cwd).replace(/[\\/:.]/g, '-')
  const guess = join(homedir(), '.claude', 'projects', encoded, `${id}.jsonl`)
  return existsSync(guess) ? guess : null
}

function parseTranscript(path, cwd) {
  const out = { intent: '', branch: '', files: new Set() }
  if (!path) return out

  let lines
  try {
    lines = readFileSync(path, 'utf8').split('\n')
  } catch {
    return out
  }

  for (const line of lines) {
    if (!line.trim()) continue
    let row
    try {
      row = JSON.parse(line)
    } catch {
      continue
    }

    if (!out.branch && typeof row.gitBranch === 'string') out.branch = row.gitBranch

    // The first real user message. `type` carries a dozen non-message values
    // (last-prompt, file-history-snapshot, queue-operation...), and tool results
    // arrive as type "user" too, so filter on isMeta and on the content shape.
    if (!out.intent && row.type === 'user' && !row.isMeta) {
      const content = row.message?.content
      let text = ''
      if (typeof content === 'string') text = content
      else if (Array.isArray(content)) {
        text = content
          .filter((b) => b?.type === 'text' && typeof b.text === 'string')
          .map((b) => b.text)
          .join(' ')
      }
      text = text.trim()
      if (text && !text.startsWith('<')) {
        out.intent = text.length > MAX_INTENT ? `${text.slice(0, MAX_INTENT)}…` : text
      }
    }

    const blocks = row.message?.content
    if (!Array.isArray(blocks)) continue
    for (const block of blocks) {
      if (block?.type !== 'tool_use') continue
      if (!['Write', 'Edit', 'NotebookEdit'].includes(block.name)) continue
      const file = block.input?.file_path
      if (typeof file !== 'string') continue
      // Paths are absolute and Windows-shaped; keep them relative to the repo
      try {
        const rel = relative(cwd, file).replace(/\\/g, '/')
        out.files.add(rel.startsWith('..') ? file : rel)
      } catch {
        out.files.add(file)
      }
    }
  }
  return out
}

function git(cwd, args) {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return ''
  }
}

function main() {
  const input = readStdin()
  const cwd = input.cwd || process.cwd()
  const sessionId = String(input.session_id ?? input.conversation_id ?? '')

  const journalDir = join(cwd, 'docs', 'ai', 'journal')
  const notesPath = join(journalDir, '.notes')

  const { intent, branch: branchFromTranscript, files } = parseTranscript(
    findTranscript(input, cwd),
    cwd
  )
  const branch = branchFromTranscript || git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD'])

  // Commits made while the session was open, newest first
  const commits = git(cwd, ['log', '--oneline', '-10', '--since=12 hours ago'])
    .split('\n')
    .filter(Boolean)

  let notes = ''
  try {
    if (existsSync(notesPath)) notes = readFileSync(notesPath, 'utf8').trim()
  } catch {
    /* ignore */
  }

  // Nothing to say: stay silent rather than log an empty session
  if (files.size === 0 && commits.length === 0 && !notes) return

  const now = new Date()
  const iso = now.toISOString()
  const month = iso.slice(0, 7)
  const day = iso.slice(0, 10)
  const shortId = sessionId.slice(0, 7) || 'unknown'

  const fileList = [...files]
  const shown = fileList.slice(0, MAX_FILES_LISTED).join(', ')
  const extra = fileList.length > MAX_FILES_LISTED ? ` (+${fileList.length - MAX_FILES_LISTED} altri)` : ''

  const parts = [
    `<!-- ts:${iso} -->`,
    `## ${day} · ${shortId}`,
    `**Branch:** ${branch || '—'} · **Intento:** ${intent || '—'}`,
  ]
  if (fileList.length) parts.push(`**File:** ${shown}${extra}`)
  if (commits.length) parts.push(`**Commit:**\n${commits.map((c) => `- ${c}`).join('\n')}`)
  if (notes) parts.push(`**Note:**\n${notes}`)

  mkdirSync(journalDir, { recursive: true })
  const monthFile = join(journalDir, `${month}.md`)
  const header = existsSync(monthFile) ? '' : `# Journal ${month}\n`
  appendFileSync(monthFile, `${header}\n${parts.join('\n')}\n`, 'utf8')

  if (notes) writeFileSync(notesPath, '', 'utf8')
}

try {
  main()
} catch {
  /* never disturb the end of a session */
}
process.exit(0)
