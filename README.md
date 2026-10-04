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

Add `prefix+f` (`f` for feedback) to Herdr's `config.toml`:

```toml
[[keys.command]]
key = "prefix+f"
type = "plugin_action"
command = "comment_on_copy.toggle"
```

Run `herdr config check` and `herdr server reload-config`. Set `copy_on_select = true` in `[ui]` to open the popup when selecting text.

## Use

Press your prefix key, then `f`, to toggle. While enabled, copying new text found in a Herdr pane opens a popup. Spaces can show the mode with the `$comment_on_copy` token. Common terminal hosts are supported, including WezTerm, Ghostty, Windows Terminal, kitty, and Alacritty.

For manual use, bind `comment_on_copy.open` to a shortcut using the same format above. It opens selected text, or the clipboard if there is no selection. This also works on other Wayland desktops; selected text requires no clipboard tools.

The indicator defaults to `[c]`. To use `` with a Nerd Font, put `indicator = ""` in `config.toml` under the directory printed by `herdr plugin config-dir comment_on_copy`. `COMMENT_ON_COPY_INDICATOR` overrides this setting. Restart the mode after code changes.

| Key | Action |
| --- | --- |
| Ctrl+S | Insert into the agent pane |
| Ctrl+E | Send and submit |
| Ctrl+Y | Copy the result |
| Ctrl+L | Choose an agent |
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

[Contributing](CONTRIBUTING.md) · [MIT](LICENSE).
