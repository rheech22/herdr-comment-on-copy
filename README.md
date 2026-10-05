# Comment on Copy

[English](README.md) · [한국어](README.ko.md) · [简体中文](README.zh-CN.md) · [日本語](README.ja.md)

**Drag. Comment. Send.**

https://github.com/user-attachments/assets/953d1c82-9d57-48a2-8051-0631d8c9ccef

**Drag to select terminal text and a comment popup opens automatically.** Once the mode is enabled, no extra shortcut is needed to open each comment. Add feedback, then send it to an AI agent in [Herdr](https://herdr.dev) with the selected text and its context, or collect several comments to send together. Context preserves Herdr provenance, pane metadata, and available foreground program information captured when opening the comment.

## Prerequisites

> [!IMPORTANT]
> Install **Herdr 0.9.0+** and **[Bun 1.3.0+](https://bun.com/docs/installation)** before installing this plugin. The launcher finds Bun on `PATH`, in `~/.bun/bin`, or in `~/.local/bin`, even when Herdr starts outside your login shell. Herdr does not install the Bun runtime. Check with `bun --version`.

Optional: `rg` for source-file detection.

| OS | Clipboard / automatic capture |
| --- | --- |
| macOS | Built-in tools |
| Windows | Built-in Windows PowerShell |
| Linux, X11 | `xclip` and `xprop` |
| Linux, Wayland | `wl-clipboard`; Sway or Hyprland for automatic capture |

## Install

Install from GitHub:

```sh
herdr plugin install rheech22/herdr-comment-on-copy
```

> [!IMPORTANT]
> To open the popup by dragging to select text, Herdr's `[ui]` settings must have `copy_on_select = true`, and the comment-on-copy mode must be enabled.

Update the existing `[ui]` section in Herdr's `config.toml` and bind your preferred shortcut to `comment_on_copy.toggle`. This example uses `prefix+f` (`f` for feedback):

```toml
[ui]
copy_on_select = true

[[keys.command]]
key = "prefix+f"
type = "plugin_action"
command = "comment_on_copy.toggle"
```

Run `herdr config check` and `herdr server reload-config`.

## Use

Use your configured shortcut to toggle the mode (`prefix+f` in the example above). While enabled, copying new text found in a Herdr pane opens a popup. Common terminal hosts are supported, including WezTerm, Ghostty, Windows Terminal, kitty, and Alacritty.

The popup opens before optional context finishes loading. You can type immediately; available context is captured when you send, yank, or collect. Source-file lookup is limited to Git repositories and never delays the popup.

See [Context collection](docs/context.md) for each field's source and purpose, file lookup, and collection timing and limitations.

For manual use, bind `comment_on_copy.open` to a shortcut using the same format above. It opens selected text, or the clipboard if there is no selection. This also works on other Wayland desktops; selected text requires no clipboard tools.

`Ctrl+K` collects the selection, comment, and original context, then opens the **Collection** tab with the new item focused but unchecked. Use `Tab` or click the tabs to switch; your draft and checkboxes are preserved. In Collection, use `j/k` or `↑/↓` to browse and `Space` or click an item to check it. `Ctrl+S/E/Y` combines checked items in collection order into one message; `Ctrl+L` chooses one recipient for the batch. Items stay saved locally across restarts and after these actions. `Ctrl+D` removes checked items; `Ctrl+Z` undoes the last deletion while the popup remains open. Bind `comment_on_copy.collection` to open the list without copying text.

Message actions require a nonblank comment; in Collection, every checked item must have one. Send and submit also require a target agent.

To show the mode in **Spaces**, add `$comment_on_copy` to your existing `[ui.sidebar.spaces].rows` in Herdr's `config.toml`. Example:

```toml
[ui.sidebar.spaces]
rows = [
  ["state_icon", "workspace", "$comment_on_copy"],
  ["branch", "git_status"],
]
```

Run `herdr config check` and `herdr server reload-config` after editing the layout.

The indicator appears only while automatic capture is on and the sidebar is expanded. Collapsed and mobile layouts do not show custom Spaces tokens. The default is `[c]` and requires no Nerd Font. To use <img src="docs/comment.svg" width="16" height="16" alt="comment icon"> (`U+EA6B`) with a Nerd Font, put `indicator = "\uea6b"` in `config.toml` under the directory printed by `herdr plugin config-dir comment_on_copy`. `COMMENT_ON_COPY_INDICATOR` overrides this setting. Restart the mode after code changes.

Copied and sent messages separate `context`, `selection`, and `comment` blocks. Collection batches wrap each entry in an `item` block.

| Key | Action |
| --- | --- |
| Ctrl+S | Send to the agent input |
| Ctrl+E | Submit to the agent |
| Ctrl+Y | Yank to the clipboard |
| Ctrl+L | Choose an agent |
| Ctrl+K | Collect and open Collection |
| Tab | Switch Comment / Collection |
| j / ↓, k / ↑ | Next / previous item or agent (Collection / target picker) |
| Enter | Confirm the target (picker) |
| Space / Ctrl+A | Check an item / toggle all (Collection) |
| Ctrl+D / Ctrl+Z | Remove checked items / undo deletion (Collection) |
| PageUp / PageDown | Scroll the selection |
| Esc | Close / cancel target selection |

Copies intended for pasting also open the popup while enabled. macOS and Windows detect copying identical text again; Linux detects text changes, so use the manual action for an identical copy.

Capture decisions are recorded in `capture.log` without copied text; helper/API errors are in `watch.log`. These files are in `~/.local/state/herdr/plugins/comment_on_copy` on macOS/Linux, or `%LOCALAPPDATA%\herdr\plugins\comment_on_copy` on Windows (`XDG_STATE_HOME` overrides the state root).

## Local development

From a local checkout:

```sh
bun run scripts/run.ts install
herdr plugin link .
```

Type checking and regression tests:

```sh
bun run scripts/run.ts check
```

Toggle the mode off and on after code changes. Close popups before moving or removing the checkout.

The runner also checks `~/.local/bin/bun` and `~/.bun/bin/bun` (on Windows, `bun.exe`). Override with `COMMENT_ON_COPY_BUN`. Add unrecognized terminal process names with `COMMENT_ON_COPY_TERMINALS`, separated by commas.

[Contributing](CONTRIBUTING.md) · [MIT](LICENSE). Icon: [Microsoft Codicons](https://github.com/microsoft/vscode-codicons) ([CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)).
