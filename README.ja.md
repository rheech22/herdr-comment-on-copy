# Comment on Copy

[English](README.md) · [한국어](README.ko.md) · [简体中文](README.zh-CN.md) · [日本語](README.ja.md)

コピーしたターミナルのテキストにコメントを添え、文脈とともに [Herdr](https://herdr.dev) の AI エージェントへ送るプラグインです。文脈には Herdr が収集元であることと、コメントを開く際に取得したペイン情報、フォアグラウンドのプログラムが含まれます。

必要環境：Herdr 0.9.0+、`PATH` から実行できる Bun 1.3.0+。ソースファイルの検索には、任意で `rg` を使用します。

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
> ドラッグでテキストを選択した際にポップアップを自動で開くには、Herdr の `[ui]` で `copy_on_select = true` を設定し、`prefix+f` でモードを有効にする必要があります。

Herdr の `config.toml` にある既存の `[ui]` 設定を更新し、`prefix+f` のショートカットを追加します（`f` は feedback、フィードバック）：

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

プレフィックスキーの後に `f` を押すと、有効・無効を切り替えます。有効な状態で Herdr のペインにある新しいテキストをコピーすると、ポップアップが開きます。Spaces の `$comment_on_copy` トークンでモードの状態を表示できます。WezTerm、Ghostty、Windows Terminal、kitty、Alacritty などの主要なターミナルに対応しています。

手動で開くには、上記と同じ形式で `comment_on_copy.open` にショートカットを設定します。選択したテキストを優先し、選択がない場合はクリップボードを使用します。他の Wayland デスクトップでも利用でき、選択したテキストにはクリップボード用ツールが不要です。

`Ctrl+K` は選択テキスト、コメント、元の文脈を保存し、**Collection** タブへ移動します。新しい項目にはフォーカスが移りますが、チェックは付きません。`Tab` またはタブのクリックで切り替え、下書きとチェック状態は保持されます。Collection では`j/k` で移動し、`Space` または項目のクリックでチェックします。`Ctrl+S/E/Y` はチェックした項目を収集順に一つのメッセージへまとめて処理し、`Ctrl+L` は全項目の送信先を選択します。項目はローカルに保存され、再起動や操作後も残ります。`Ctrl+D` でチェックした項目を削除し、ポップアップを開いている間は `Ctrl+Z` で最後の削除を取り消せます。新しいテキストをコピーせずに一覧を開くには、`comment_on_copy.collection` にショートカットを設定します。

メッセージ操作には空でないコメントが必要です。Collection ではチェックしたすべての項目にコメントが必要で、send と submit には送信先エージェントも必要です。

標準の表示は `[c]` です。Nerd Font の <img src="docs/comment.svg" width="16" height="16" alt="comment icon"> (`U+EA6B`) を使うには、`herdr plugin config-dir comment_on_copy` で確認したディレクトリの `config.toml` に `indicator = "\uea6b"` を追加します。環境変数 `COMMENT_ON_COPY_INDICATOR` がこの設定より優先されます。コード変更後はモードを無効にしてから再び有効にします。

コピー・送信結果は `context`、`selection`、`comment` の各ブロックに分かれます。Collection の一括処理では、各項目を `item` ブロックで囲みます。

| キー | 操作 |
| --- | --- |
| Ctrl+S | エージェントの入力欄へ挿入 |
| Ctrl+E | 送信して実行 |
| Ctrl+Y | 結果をコピー |
| Ctrl+L | エージェントを選択 |
| Ctrl+K | 保存して Collection を開く |
| Tab | Comment / Collection の切り替え |
| j / k | 次 / 前の項目に移動（Collection） |
| Space / Ctrl+A | 項目をチェック / 全選択を切り替え（Collection） |
| Ctrl+D / Ctrl+Z | チェックした項目を削除 / 削除を取り消し（Collection） |
| PageUp / PageDown | 選択したテキストをスクロール |
| Esc | 閉じる |

最近コピーした内容の重複は無視されます。有効な間は、貼り付け用のコピーでもポップアップが開きます。

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
