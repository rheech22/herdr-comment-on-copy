# Comment on Copy

[English](README.md) · [한국어](README.ko.md) · [简体中文](README.zh-CN.md) · [日本語](README.ja.md)

**Drag. Comment. Send.**

https://github.com/user-attachments/assets/953d1c82-9d57-48a2-8051-0631d8c9ccef

**拖动选择终端文本，即可自动打开批注弹窗。** 开启模式后，每次添加批注都无需再按快捷键打开弹窗。写下反馈，将选中文本和上下文一起发送给 [Herdr](https://herdr.dev) 中的 AI 智能体，也可以收集多条批注后统一发送。上下文保留 Herdr 来源、打开批注时的窗格信息以及可获取的前台程序信息。

## 前置条件

> [!IMPORTANT]
> 安装此插件前，请先安装 **Herdr 0.9.0+** 和 **[Bun 1.3.0+](https://bun.com/docs/installation)**。即使 Herdr 在登录 shell 之外启动，启动器也会从 `PATH`、`~/.bun/bin` 或 `~/.local/bin` 查找 Bun。Herdr 不会安装 Bun 运行时。使用 `bun --version` 检查。

可选：使用 `rg` 查找源文件。

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
> 要在拖动选择文本时自动打开弹窗，必须在 Herdr 的 `[ui]` 中设置 `copy_on_select = true`，并开启批注模式。

在 Herdr 的 `config.toml` 中修改现有的 `[ui]` 配置，并将任意快捷键绑定到 `comment_on_copy.toggle`。以下示例使用 `prefix+f`（`f` 表示 feedback，反馈）：

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

使用配置的快捷键开启或关闭此模式（上例为 `prefix+f`）。开启后，复制 Herdr 窗格中可找到的新文本即可打开弹窗。支持 WezTerm、Ghostty、Windows Terminal、kitty、Alacritty 等常用终端。

弹窗无需等待额外上下文收集完成即可打开，您可以立即输入。发送、复制或收集时包含当时已获取的上下文。源文件搜索仅限 Git 仓库，不会延迟弹窗打开。

如需手动打开，请按上述格式为 `comment_on_copy.open` 配置快捷键。优先使用选中文本，没有选区时使用剪贴板。其他 Wayland 桌面也可使用；选中文本无需剪贴板工具。

`Ctrl+K` 保存选中文本、批注和原始上下文，然后切换到 **Collection** 标签页。新条目获得焦点，但不会自动勾选。按 `Tab` 或点击标签页切换，草稿和勾选状态会保留。在 Collection 中使用 `j/k` 或 `↑/↓` 浏览，按 `Space` 或点击条目勾选。`Ctrl+S/E/Y` 将勾选条目按收集顺序合并为一条消息处理；`Ctrl+L` 为整批条目选择接收者。条目保存在本地，重启或执行操作后仍会保留。`Ctrl+D` 删除勾选条目，弹窗保持打开时可用 `Ctrl+Z` 撤销最后一次删除。为 `comment_on_copy.collection` 配置快捷键，即可直接打开列表，无需复制新文本。

消息操作需要非空批注；在 Collection 中，每个勾选条目都必须有批注。send 和 submit 还需要选择目标智能体。

如需在 **Spaces** 中显示模式状态，请在 Herdr 的 `config.toml` 中现有的 `[ui.sidebar.spaces].rows` 中添加 `$comment_on_copy`。示例：

```toml
[ui.sidebar.spaces]
rows = [
  ["state_icon", "workspace", "$comment_on_copy"],
  ["branch", "git_status"],
]
```

修改布局后，运行 `herdr config check` 和 `herdr server reload-config`。

标记仅在自动检测模式开启且侧边栏展开时显示。折叠侧边栏和移动端布局不显示自定义 Spaces 标记。默认值为 `[c]`，无需 Nerd Font。如需使用 Nerd Font 的 <img src="docs/comment.svg" width="16" height="16" alt="comment icon"> (`U+EA6B`)，请运行 `herdr plugin config-dir comment_on_copy`，在该目录的 `config.toml` 中添加 `indicator = "\uea6b"`。环境变量 `COMMENT_ON_COPY_INDICATOR` 优先于此设置。修改代码后请关闭并重新开启模式。

复制和发送的结果分为 `context`、`selection`、`comment` 区块。Collection 批量操作还会用 `item` 区块包裹每个条目。

| 按键 | 操作 |
| --- | --- |
| Ctrl+S | 插入智能体输入区 |
| Ctrl+E | 发送并提交 |
| Ctrl+Y | 复制结果 |
| Ctrl+L | 选择智能体 |
| Ctrl+K | 收集并打开 Collection |
| Tab | 切换 Comment / Collection |
| j / ↓, k / ↑ | 下一个 / 上一个条目或智能体（Collection / 目标选择） |
| Enter | 确认目标 |
| Space / Ctrl+A | 勾选条目 / 切换全选（Collection） |
| Ctrl+D / Ctrl+Z | 删除勾选条目 / 撤销删除（Collection） |
| PageUp / PageDown | 滚动选中文本 |
| Esc | 关闭 / 取消目标选择 |

开启后，为粘贴而进行的复制也会打开弹窗。macOS 和 Windows 可以检测再次复制相同文本；Linux 检测文本变化，再次复制相同内容时请使用手动操作。

检测结果及跳过原因记录在 `capture.log` 中，不包含复制的文本；辅助进程/API 错误记录在 `watch.log` 中。文件位于 macOS/Linux 的 `~/.local/state/herdr/plugins/comment_on_copy`，或 Windows 的 `%LOCALAPPDATA%\herdr\plugins\comment_on_copy`（`XDG_STATE_HOME` 可覆盖状态根目录）。

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
