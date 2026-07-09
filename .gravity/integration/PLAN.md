# integration — PLAN (the agent-adapter seam)

Status: ✓ shipped <!-- ○ planned · ◑ building · ✓ shipped — mirror into the IMPLEMENTATION_PLAN.md spine -->

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

- [x] Round-trip pipe proven in Chromium: an external script subscribed to `change`,
  read markdown context, applied one hardcoded `transact` edit — it rendered, fired
  exactly one change event, and Ctrl+Z restored the original document byte-for-byte
- [x] `@custom-wysiwyg/agent-adapter` designed from that usage (name confirmed):
  `connectAgent(editor)` → `getContext()` (markdown + selection + selected text),
  `onContext(cb)` (debounced), `applyMarkdown/applyBlocks` with modes
  `insert | append | replaceDocument` (each ONE undoable transaction, origin
  'agent'), and `createStreamWriter()` buffering streamed output into block-sized
  transactions (the SPEC wall, mechanized — flushes on blank-line boundaries)
- [x] Scripted agent session in the demo: 🤖 button reads real context and streams
  a summary back in chunks; undo unwinds it batch by batch

## Verification

1. `npm run build && npm test` — green (the contract surface is typed + tested in core).
2. Round-trip smoke: run the milestone script → edit appears, `change` fires, undo works.

## Outcome (2026-07-09)

Shipped through the scripted-session milestone. Design finding from real usage:
`insertBlocks`' paste-oriented inline splice was wrong for streamed continuations
(a streamed paragraph merged into the previous block) — core gained an
`{ inline?: boolean }` option; the stream writer always applies block-granular.
Empty markdown payloads are rejected at the adapter (the parser's empty-doc
fallback would otherwise read as a valid edit).

## Open questions

- OPEN: which REAL agent drives the first live pass (a Claude session via MCP, or a
  local script calling an API) — user's call; the adapter is agent-agnostic and the
  demo button shows the full loop with a scripted stand-in.
