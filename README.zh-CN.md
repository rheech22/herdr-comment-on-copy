# Comment on Copy

[English](README.md) · [한국어](README.ko.md) · [简体中文](README.zh-CN.md) · [日本語](README.ja.md)

为复制的终端文本添加批注，并将文本、上下文和批注发送给 [Herdr](https://herdr.dev) 中的 AI 智能体。上下文标明 Herdr 来源，并包含打开批注时收集到的窗格信息和前台程序。

要求：Herdr 0.9.0+，以及可通过 `PATH` 运行的 Bun 1.3.0+。可选：使用 `rg` 查找源文件。

| OS | 剪贴板 / 自动检测 |
| --- | --- |
| macOS | 系统自带工具 |
| Windows | 系统自带 Windows PowerShell |
| Linux, X11 | `xclip`、`xprop` |
| Linux, Wayland | `wl-clipboard`；自动检测需要 Sway 或 Hyprland |

## 安装

从 GitHub 安装：

```sh
herdr plugin install rheech22/herdr-comment-on-copy
```

> [!IMPORTANT]
> 要在拖动选择文本时自动打开弹窗，必须在 Herdr 的 `[ui]` 中设置 `copy_on_select = true`，并通过 `prefix+f` 开启此模式。

在 Herdr 的 `config.toml` 中修改现有的 `[ui]` 配置，并添加 `prefix+f` 快捷键（`f` 表示 feedback，反馈）：

```toml
[ui]
copy_on_select = true

[[keys.command]]
key = "prefix+f"
type = "plugin_action"
command = "comment_on_copy.toggle"
```

运行 `herdr config check` 和 `herdr server reload-config`。

## 使用

按前缀键，再按 `f`，开启或关闭此模式。开启后，复制 Herdr 窗格中可找到的新文本即可打开弹窗。Spaces 可通过 `$comment_on_copy` 标记显示模式状态。支持 WezTerm、Ghostty、Windows Terminal、kitty、Alacritty 等常用终端。

如需手动打开，请按上述格式为 `comment_on_copy.open` 配置快捷键。优先使用选中文本，没有选区时使用剪贴板。其他 Wayland 桌面也可使用；选中文本无需剪贴板工具。

`Ctrl+K` 保存选中文本、批注（可留空）和原始上下文，然后切换到 **Collection** 标签页。新条目获得焦点，但不会自动勾选。按 `Tab` 或点击标签页切换，草稿和勾选状态会保留。在 Collection 中使用方向键浏览，按 `Space` 或点击条目勾选。`Ctrl+S/E/Y` 将勾选条目按收集顺序合并为一条消息处理；`Ctrl+L` 为整批条目选择接收者。条目保存在本地，重启或执行操作后仍会保留。`Delete` 删除勾选条目，弹窗保持打开时可用 `Ctrl+Z` 撤销最后一次删除。为 `comment_on_copy.collection` 配置快捷键，即可直接打开列表，无需复制新文本。

默认标记为 `[c]`。如需使用 Nerd Font 的 <img src="docs/comment.svg" width="16" height="16" alt="comment icon"> (`U+EA6B`)，请运行 `herdr plugin config-dir comment_on_copy`，在该目录的 `config.toml` 中添加 `indicator = "\uea6b"`。环境变量 `COMMENT_ON_COPY_INDICATOR` 优先于此设置。修改代码后请关闭并重新开启模式。

| 按键 | 操作 |
| --- | --- |
| Ctrl+S | 插入智能体输入区 |
| Ctrl+E | 发送并提交 |
| Ctrl+Y | 复制结果 |
| Ctrl+L | 选择智能体 |
| Ctrl+K | 收集并打开 Collection |
| Tab | 切换 Comment / Collection |
| Space / Ctrl+A | 勾选条目 / 切换全选（Collection） |
| Delete / Ctrl+Z | 删除勾选条目 / 撤销删除（Collection） |
| PageUp / PageDown | 滚动选中文本 |
| Esc | 关闭 |

最近复制过的重复内容会被忽略。开启后，为粘贴而进行的复制也会打开弹窗。

## 本地开发

在本地仓库中运行：

```sh
bun run scripts/run.ts install
herdr plugin link .
```

类型检查和回归测试：

```sh
bun run scripts/run.ts check
```

修改代码后，关闭并重新开启此模式。移动或删除仓库前，请关闭弹窗。

运行脚本也会检查 `~/.local/bin/bun` 和 `~/.bun/bin/bun`（Windows 使用 `bun.exe`）。可通过 `COMMENT_ON_COPY_BUN` 指定运行程序。未识别的终端进程名称可添加到 `COMMENT_ON_COPY_TERMINALS`，用逗号分隔。

[贡献指南](CONTRIBUTING.md) · [MIT](LICENSE). 图标：[Microsoft Codicons](https://github.com/microsoft/vscode-codicons)（[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)）。
