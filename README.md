# Comment on Copy

[English](README.md) · [한국어](README.ko.md) · [简体中文](README.zh-CN.md) · [日本語](README.ja.md)

Add a comment to copied terminal text and send it, with context, to an AI agent in [Herdr](https://herdr.dev). Context identifies Herdr as the source and includes available pane metadata and foreground programs captured when opening the comment.

Requirements: Herdr 0.9.0+ and Bun 1.3.0+ on `PATH`. Optional: `rg` for source-file detection.

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
> To open the popup by dragging to select text, Herdr's `[ui]` settings must have `copy_on_select = true`, and the mode must be enabled with `prefix+f`.

Update the existing `[ui]` section in Herdr's `config.toml` and add `prefix+f` (`f` for feedback):

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

Press your prefix key, then `f`, to toggle. While enabled, copying new text found in a Herdr pane opens a popup. Spaces can show the mode with the `$comment_on_copy` token. Common terminal hosts are supported, including WezTerm, Ghostty, Windows Terminal, kitty, and Alacritty.

For manual use, bind `comment_on_copy.open` to a shortcut using the same format above. It opens selected text, or the clipboard if there is no selection. This also works on other Wayland desktops; selected text requires no clipboard tools.

`Ctrl+K` collects the selection, comment, and original context, then opens the **Collection** tab with the new item focused but unchecked. Use `Tab` or click the tabs to switch; your draft and checkboxes are preserved. In Collection, use `j/k` to browse and `Space` or click an item to check it. `Ctrl+S/E/Y` combines checked items in collection order into one message; `Ctrl+L` chooses one recipient for the batch. Items stay saved locally across restarts and after these actions. `Ctrl+D` removes checked items; `Ctrl+Z` undoes the last deletion while the popup remains open. Bind `comment_on_copy.collection` to open the list without copying text.

Message actions require a nonblank comment; in Collection, every checked item must have one. Send and submit also require a target agent.

The indicator defaults to `[c]`. To use <img src="docs/comment.svg" width="16" height="16" alt="comment icon"> (`U+EA6B`) with a Nerd Font, put `indicator = "\uea6b"` in `config.toml` under the directory printed by `herdr plugin config-dir comment_on_copy`. `COMMENT_ON_COPY_INDICATOR` overrides this setting. Restart the mode after code changes.

Copied and sent messages separate `context`, `selection`, and `comment` blocks. Collection batches wrap each entry in an `item` block.

| Key | Action |
| --- | --- |
| Ctrl+S | Send to the agent input |
| Ctrl+E | Submit to the agent |
| Ctrl+Y | Yank to the clipboard |
| Ctrl+L | Choose an agent |
| Ctrl+K | Collect and open Collection |
| Tab | Switch Comment / Collection |
| j / k | Next / previous item (Collection) |
| Space / Ctrl+A | Check an item / toggle all (Collection) |
| Ctrl+D / Ctrl+Z | Remove checked items / undo deletion (Collection) |
| PageUp / PageDown | Scroll the selection |
| Esc | Close |

Recent duplicate clipboard values are ignored. Copies intended for pasting also open the popup while enabled.

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
