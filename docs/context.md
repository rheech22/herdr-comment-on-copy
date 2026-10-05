# Context collection

[English](context.md) · [한국어](context.ko.md) · [简体中文](context.zh-CN.md) · [日本語](context.ja.md)

Messages contain separate `context`, `selection`, and `comment` blocks. Context helps the receiving agent understand where the selected terminal text came from and which project, program, or file it relates to. Unavailable optional fields are omitted.

## Fields

| Field | How it is collected | Purpose |
| --- | --- | --- |
| `source` | Fixed text identifying Herdr and Comment on Copy. | Identifies the tool that supplied the context. |
| `capture` | Fixed description of selected/copied terminal text and available pane metadata. | Explains how to interpret the captured information. |
| `workspace` | The workspace ID from `pane.get`, mapped to a label from `workspace.list`; falls back to the ID. | Identifies the workspace. |
| `tab` | The tab ID from `pane.get`, mapped to a label from `tab.list`; falls back to the ID. | Distinguishes work within a workspace. |
| `pane` | The pane whose visible text matches the selection. Manual opening falls back to the focused pane if no match is found. | Identifies the terminal that supplied the text. |
| `process` | Foreground process names returned by `pane.process_info`, deduplicated and joined. | Identifies the program running in the foreground, such as `codex`, `hunk`, or `zsh`. |
| `agent` | Herdr's detected agent from `pane.get`. | Identifies the agent Herdr associates with the pane. |
| `title` | The terminal title without control codes, returned by `pane.get`. | Adds a session or task title when the program supplies one. |
| `cwd` | `foreground_cwd` from `pane.get`, falling back to the pane's `cwd`; the home directory is shortened to `~`. | Provides the working directory for project and relative-path interpretation. |
| `branch` | `git -C <cwd> rev-parse --abbrev-ref HEAD`, with a 150 ms timeout. | Provides the Git branch; detached HEAD returns `HEAD`. |
| `selection` | Line and Unicode code-point counts calculated from the text after removing trailing newlines; optionally the matched starting screen row. | Describes the selection's size and screen position. |
| `files` | Path-like tokens extracted from the selection and checked for existence, relative to `cwd` where needed; at most five. | Lists paths explicitly mentioned in the text. |
| `file` | Optional fixed-string search for a selected line in the Git repository, returning a relative path and line number. | Infers a file location when a copied code snippet has no filename. |
| `captured_at` | An ISO timestamp recorded while preparing the popup payload; included when sending or copying Collection items. | Distinguishes when the capture was prepared. |
| `collected_at` | The ISO timestamp when Collect saves the item; included in Collection output. | Distinguishes capture from saving and describes collection order. |

`process` and `agent` describe different things: the foreground program and Herdr's agent classification. The plugin asks Herdr for both rather than scanning the system's process list itself.

`screen row` is a zero-based position in the visible terminal, not a source-file line number. It is omitted if only a later selected line establishes the match, and removed when `file` is found to avoid confusing the two locations.

## Finding the source pane

Automatic capture compares the copied text with visible pane contents through `pane.list` and `pane.read`. The focused pane is checked first, then other panes in groups of four. Comparison tolerates Markdown decoration, terminal color codes, whitespace differences, and soft wrapping; meaningful lines beyond the first may establish a match. This normalization is only for matching and does not rewrite the selected content.

A failed match gets one focused-pane retry after 40 ms, within a 250 ms total lookup budget. If no pane matches, automatic capture does not open a popup. Manual opening may use the focused pane instead; that fallback does not prove where the clipboard text originated.

## Why search for files?

A code snippet may contain no filename. Supplying `file: src/example.ts:42` can save the receiving agent from finding that snippet again. This inference is less useful for ordinary terminal output, so it is optional and runs after the popup opens.

`files` only checks paths mentioned in the selection. It does not search file contents or verify any mentioned line number. `file` searches contents with Git and optional `rg`:

1. Choose the longest trimmed selected line; skip lookup if it has fewer than 30 Unicode code points.
2. Skip missing working directories, the home directory, and filesystem roots.
3. Ask Git for the repository root and working-directory prefix, allowing at most 150 ms. Skip non-repositories and roots that resolve to the home directory or a filesystem root.
4. Search that repository with `rg --fixed-strings --line-number --max-count 1`. Normal `rg` ignore rules apply. Accept only one result; no result or results in multiple files produce no `file` field.
5. Within that file, try the first selected line with at least 12 code points to refine the reported line number. Otherwise keep the longest-line match.
6. Report the path relative to `cwd`. All subprocesses share one 500 ms total budget, including the Git lookup and line-number refinement.

The result is a candidate location, not proof that the entire selection came from that file. `--max-count 1` returns the first matching line per file, so repeated matches within one file are not disambiguated. Timeouts, missing tools, and lookup failures simply omit `file`. A matching entry in `files` is removed when `file` supplies that path.

## Collection timing

The popup opens with `source`, `capture`, `pane` when available, and `selection`. After the UI mounts, pane details, workspace/tab labels, and foreground process information are requested in parallel. Git branch and file lookup then run in parallel; agent targets load independently of this context work. Duplicate API requests are shared within that popup only.

Send, yank, and Collect use the context available at the action time. Collect saves a copy of that context; later background updates or reopening Collection do not replace it with current pane metadata. Sending and copying Collection items add `captured_at` and `collected_at` to each item's context.

`captured_at` is the plugin's preparation time, not an OS clipboard-event timestamp. Metadata is queried after the popup opens and is not an atomic snapshot of the exact copy instant. Closing the popup cancels pending enrichment and prevents late updates from affecting another capture.

## Agent targets

Recipient candidates come from `agent.list`, with labels from `workspace.list` and `tab.list`. Automatic choice prefers an agent in the source pane, then the focused pane, then a unique agent in the same tab or workspace, then a sole global candidate. Ambiguous candidates require a choice. The recipient list is not added to the message's `context`.

Implementation: [context fields and file lookup](../src/context.ts), [pane matching](../src/herdr.ts), [background enrichment](../src/enrich.ts), and [message composition](../src/model.ts).

[Back to README](../README.md)
