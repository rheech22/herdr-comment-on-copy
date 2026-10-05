# Comment on Copy

[English](README.md) · [한국어](README.ko.md) · [简体中文](README.zh-CN.md) · [日本語](README.ja.md)

**Drag. Comment. Send.**

https://github.com/user-attachments/assets/953d1c82-9d57-48a2-8051-0631d8c9ccef

**ターミナルのテキストをドラッグして選択すると、コメント用のポップアップが自動で開きます。** モードを一度有効にすれば、コメントのたびにポップアップを開くショートカットを押す必要はありません。選択したテキストと文脈にコメントを添えて [Herdr](https://herdr.dev) の AI エージェントへ送信したり、複数のコメントを集めてまとめて送信したりできます。文脈には Herdr が収集元であること、コメントを開く際のペイン情報、取得可能なフォアグラウンドのプログラム情報が含まれます。

## 前提条件

> [!IMPORTANT]
> プラグインをインストールする前に、**Herdr 0.9.0+** と **[Bun 1.3.0+](https://bun.com/docs/installation)** をインストールしてください。Herdr をログインシェル以外から起動しても、ランチャーが `PATH`、`~/.bun/bin`、`~/.local/bin` から Bun を探します。Herdr は Bun ランタイムをインストールしません。`bun --version` で確認できます。

ソースファイルの検索には、任意で `rg` を使用します。

| OS | クリップボード / 自動検出 |
| --- | --- |
| macOS | 標準搭載のツール |
| Windows | 標準搭載の Windows PowerShell |
| Linux, X11 | `xclip`、`xprop` |
| Linux, Wayland | `wl-clipboard`。自動検出には Sway または Hyprland が必要 |

## インストール

GitHub からインストール：

```sh
herdr plugin install rheech22/herdr-comment-on-copy
```

> [!IMPORTANT]
> ドラッグでテキストを選択した際にポップアップを自動で開くには、Herdr の `[ui]` で `copy_on_select = true` を設定し、コメントモードを有効にする必要があります。

Herdr の `config.toml` にある既存の `[ui]` 設定を更新し、任意のショートカットを `comment_on_copy.toggle` に割り当てます。以下の例では `prefix+f` を使用します（`f` は feedback、フィードバック）：

```toml
[ui]
copy_on_select = true

[[keys.command]]
key = "prefix+f"
type = "plugin_action"
command = "comment_on_copy.toggle"
```

`herdr config check` と `herdr server reload-config` を実行します。

## 使い方

設定したショートカットでモードの有効・無効を切り替えます（上の例では `prefix+f`）。有効な状態で Herdr のペインにある新しいテキストをコピーすると、ポップアップが開きます。WezTerm、Ghostty、Windows Terminal、kitty、Alacritty などの主要なターミナルに対応しています。

ポップアップは追加の context 収集を待たずに開き、すぐに入力できます。送信・コピー・収集時点で取得済みの context が含まれます。元ファイルの検索は Git リポジトリ内に限定し、ポップアップ表示を遅らせません。

各項目の収集方法と目的、ファイル検索、収集時点と制限は[コンテキストの収集](docs/context.ja.md)を参照してください。

手動で開くには、上記と同じ形式で `comment_on_copy.open` にショートカットを設定します。選択したテキストを優先し、選択がない場合はクリップボードを使用します。他の Wayland デスクトップでも利用でき、選択したテキストにはクリップボード用ツールが不要です。

`Ctrl+K` は選択テキスト、コメント、元の文脈を保存し、**Collection** タブへ移動します。新しい項目にはフォーカスが移りますが、チェックは付きません。`Tab` またはタブのクリックで切り替え、下書きとチェック状態は保持されます。Collection では`j/k` または `↑/↓` で移動し、`Space` または項目のクリックでチェックします。`Ctrl+S/E/Y` はチェックした項目を収集順に一つのメッセージへまとめて処理し、`Ctrl+L` は全項目の送信先を選択します。項目はローカルに保存され、再起動や操作後も残ります。`Ctrl+D` でチェックした項目を削除し、ポップアップを開いている間は `Ctrl+Z` で最後の削除を取り消せます。新しいテキストをコピーせずに一覧を開くには、`comment_on_copy.collection` にショートカットを設定します。

メッセージ操作には空でないコメントが必要です。Collection ではチェックしたすべての項目にコメントが必要で、send と submit には送信先エージェントも必要です。

**Spaces** にモードの状態を表示するには、Herdr の `config.toml` にある既存の `[ui.sidebar.spaces].rows` に `$comment_on_copy` を追加します。例：

```toml
[ui.sidebar.spaces]
rows = [
  ["state_icon", "workspace", "$comment_on_copy"],
  ["branch", "git_status"],
]
```

レイアウトを変更したら、`herdr config check` と `herdr server reload-config` を実行してください。

表示は自動検出モードが有効で、サイドバーが展開されているときにのみ現れます。折りたたまれたサイドバーとモバイルのレイアウトでは、カスタム Spaces トークンは表示されません。標準は `[c]` で、Nerd Font は不要です。Nerd Font の <img src="docs/comment.svg" width="16" height="16" alt="comment icon"> (`U+EA6B`) を使うには、`herdr plugin config-dir comment_on_copy` で確認したディレクトリの `config.toml` に `indicator = "\uea6b"` を追加します。環境変数 `COMMENT_ON_COPY_INDICATOR` がこの設定より優先されます。コード変更後はモードを無効にしてから再び有効にします。

コピー・送信結果は `context`、`selection`、`comment` の各ブロックに分かれます。Collection の一括処理では、各項目を `item` ブロックで囲みます。

| キー | 操作 |
| --- | --- |
| Ctrl+S | エージェントの入力欄へ挿入 |
| Ctrl+E | 送信して実行 |
| Ctrl+Y | 結果をコピー |
| Ctrl+L | エージェントを選択 |
| Ctrl+K | 保存して Collection を開く |
| Tab | Comment / Collection の切り替え |
| j / ↓, k / ↑ | 次 / 前の項目またはエージェントへ移動（Collection / 送信先選択） |
| Enter | 送信先を確定 |
| Space / Ctrl+A | 項目をチェック / 全選択を切り替え（Collection） |
| Ctrl+D / Ctrl+Z | チェックした項目を削除 / 削除を取り消し（Collection） |
| PageUp / PageDown | 選択したテキストをスクロール |
| Esc | 閉じる / 送信先選択を取り消す |

有効な間は、貼り付け用のコピーでもポップアップが開きます。macOS と Windows では同じテキストの再コピーも検出します。Linux はテキストの変化を検出するため、同じ内容を再コピーする場合は手動操作を使ってください。

検出結果とスキップ理由は、コピーしたテキストを含めず `capture.log` に記録します。補助プロセス/API のエラーは `watch.log` に記録します。ファイルの場所は macOS/Linux の `~/.local/state/herdr/plugins/comment_on_copy`、Windows の `%LOCALAPPDATA%\herdr\plugins\comment_on_copy` です（`XDG_STATE_HOME` で状態のルートを変更できます）。

## ローカル開発

ローカルのリポジトリで実行：

```sh
bun run scripts/run.ts install
herdr plugin link .
```

型チェックと回帰テスト：

```sh
bun run scripts/run.ts check
```

コードを変更したら、モードを無効にしてから再び有効にします。リポジトリを移動・削除する前に、ポップアップを閉じてください。

実行スクリプトは `~/.local/bin/bun` と `~/.bun/bin/bun` も確認します（Windows は `bun.exe`）。`COMMENT_ON_COPY_BUN` で実行ファイルを指定できます。未認識のターミナルのプロセス名は、`COMMENT_ON_COPY_TERMINALS` にカンマ区切りで追加できます。

[貢献ガイド](CONTRIBUTING.md) · [MIT](LICENSE). アイコン：[Microsoft Codicons](https://github.com/microsoft/vscode-codicons)（[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)）。
