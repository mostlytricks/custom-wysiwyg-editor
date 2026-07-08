# integration — PLAN (the agent-adapter seam)

Status: ○ planned <!-- ○ planned · ◑ building · ✓ shipped — mirror into the IMPLEMENTATION_PLAN.md spine -->

> **Correction (2026-07-08).** An earlier version of this plan (written from a remote
> session that couldn't see `ai-workspace`) assumed "gravity" is an AI runtime that
> proposes/prioritizes edits. It isn't — gravity is the *documentation/discipline
> system* this very `.gravity/` folder implements. The five "blocked" questions about
> gravity's consumption/production/runtime are dissolved. What survives, renamed
> honestly: this domain owns the **agent-adapter seam** — how ANY external agent
> (an LLM tool, a collaboration layer, a script) reads the document and applies edits.

## Goal

An external agent can read the document, propose an edit, and apply it as a normal
**undoable transaction** through the same pure-command door as keystrokes — proven by
a round-trip smoke test, then by one real agent-driven editing session in the demo.

## Editor-side contract — ✅ shipped, stable

| Need | API |
| --- | --- |
| Read document | `editor.getDoc()` → plain JSON |
| Read as LLM context | `serializeMarkdown(doc)` (or `serializeHTML`) |
| Apply an edit (undoable, fires events) | `editor.transact(state => newState)` — compose pure commands (`insertText`, `deleteRange`, `setHeading`, …) |
| Load wholesale (resets history) | `editor.setDoc(doc)` — loading only, not agent edits |
| Observe | `editor.on('change' \| 'update' \| 'focus' \| 'blur', cb)` |
| Target the user's position | `editor.getState().selection` (`{block, offset}`) |

Walls this seam inherits (from `../core/SPEC.md`): agent edits go through `transact`
**only** — never `setDoc` (nukes undo history), never the DOM; streaming output must be
buffered into block-sized `transact` calls.

## Scenario

- given a document open in the demo, when an external script subscribes to `change`
  and applies one `transact` edit → the edit renders, fires events, and **Ctrl+Z
  undoes it** exactly like a keystroke
- given an agent producing streamed text, when the adapter applies it → edits arrive
  as discrete block-sized transactions, never partial-span writes

## Slice (first milestone — prove the pipe, no AI logic)

- **[NEW]** a script that subscribes to `change`, logs `serializeMarkdown(doc)` on
  every edit, and applies one hardcoded `transact` edit against
  `examples/vanilla/index.html` (after `npm run build`)
- When that round-trips: design `@custom-wysiwyg/agent-adapter` (naming decided then,
  with real requirements in hand — not before)

## Verification

1. `npm run build && npm test` — green (the contract surface is typed + tested in core).
2. Round-trip smoke: run the milestone script → edit appears, `change` fires, undo works.

## Open questions

- OPEN: adapter package naming + shape — decide AFTER the round-trip milestone, from
  real usage (the old plan tried to decide it from guesses about a system it couldn't see).
- OPEN: which agent drives the first real pass (a Claude Code session via MCP? a local
  script calling an API?) — user's call when the pipe is proven.
