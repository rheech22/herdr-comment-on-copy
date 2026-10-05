# Comment on Copy

[English](README.md) · [한국어](README.ko.md) · [简体中文](README.zh-CN.md) · [日本語](README.ja.md)

**Drag. Comment. Send.**

https://github.com/user-attachments/assets/953d1c82-9d57-48a2-8051-0631d8c9ccef

**터미널 텍스트를 드래그하면 코멘트 팝업이 자동으로 열립니다.** 모드를 한 번 켜두면 매번 팝업을 열기 위한 추가 단축키가 필요 없습니다. 코멘트를 작성해 선택 텍스트와 context를 [Herdr](https://herdr.dev)의 AI 에이전트로 보내거나, 여러 코멘트를 모아 한 번에 보낼 수 있습니다. context에는 Herdr 출처와 팝업을 열 때 수집한 pane 정보, 확인 가능한 전경 프로그램이 포함됩니다.

## 사전 조건

> [!IMPORTANT]
> 플러그인 설치 전에 **Herdr 0.9.0+**와 **[Bun 1.3.0+](https://bun.com/docs/installation)**를 설치해야 합니다. Herdr를 로그인 셸 밖에서 실행해도 런처가 `PATH`, `~/.bun/bin`, `~/.local/bin`에서 Bun을 찾습니다. Herdr는 Bun 런타임을 설치해주지 않습니다. `bun --version`으로 확인합니다.

원본 파일 탐색에는 `rg`를 선택적으로 사용합니다.

| OS | 클립보드 / 자동 감지 |
| --- | --- |
| macOS | 기본 제공 도구 |
| Windows | 기본 제공 Windows PowerShell |
| Linux, X11 | `xclip`, `xprop` |
| Linux, Wayland | `wl-clipboard`; 자동 감지에는 Sway 또는 Hyprland 필요 |

## 설치

GitHub에서 설치:

```sh
herdr plugin install rheech22/herdr-comment-on-copy
```

> [!IMPORTANT]
> 드래그로 텍스트를 선택할 때 팝업이 자동으로 열리려면, Herdr의 `[ui]`에서 `copy_on_select = true`가 설정되어 있고 코멘트 모드가 켜져 있어야 합니다.

Herdr의 `config.toml`에서 기존 `[ui]` 항목을 수정하고 원하는 단축키를 `comment_on_copy.toggle`에 연결합니다. 아래 예시는 `prefix+f`를 사용합니다(`f`는 feedback, 피드백):

```toml
[ui]
copy_on_select = true

[[keys.command]]
key = "prefix+f"
type = "plugin_action"
command = "comment_on_copy.toggle"
```

`herdr config check`와 `herdr server reload-config`를 실행합니다.

## 사용

설정한 단축키로 모드를 켜거나 끕니다(위 예시에서는 `prefix+f`). 켜진 상태에서 Herdr pane에 있는 새 텍스트를 복사하면 팝업이 열립니다. WezTerm, Ghostty, Windows Terminal, kitty, Alacritty 등 주요 터미널을 지원합니다.

팝업은 추가 context 수집을 기다리지 않고 열리므로 바로 입력할 수 있습니다. 전송·복사·수집 시점까지 준비된 context가 포함됩니다. 원본 파일 탐색은 Git 저장소로 제한되며 팝업 표시를 지연시키지 않습니다.

항목별 수집 방식과 목적, 파일 탐색, 수집 시점과 한계는 [컨텍스트 수집](docs/context.ko.md)을 참고하세요.

수동으로 열려면 위와 같은 형식으로 `comment_on_copy.open`에 단축키를 지정합니다. 선택한 텍스트를 사용하고, 선택이 없으면 클립보드를 사용합니다. 다른 Wayland 환경에서도 사용할 수 있으며, 선택한 텍스트에는 클립보드 도구가 필요하지 않습니다.

`Ctrl+K`는 선택 텍스트·코멘트·원래 context를 저장하고 **Collection** 탭으로 이동합니다. 새 항목은 포커스만 받고 체크되지는 않습니다. `Tab` 또는 탭 클릭으로 전환하며 초안과 체크 상태는 유지됩니다. Collection에서 `j/k` 또는 `↑/↓`로 탐색하고 `Space` 또는 항목 클릭으로 체크합니다. `Ctrl+S/E/Y`는 체크한 항목들을 수집 순서대로 하나의 메시지로 묶어 처리하고, `Ctrl+L`은 전체를 받을 에이전트를 선택합니다. 항목은 재시작 및 액션 처리 후에도 로컬에 보관됩니다. `Ctrl+D`로 체크한 항목을 삭제하고, 팝업이 열린 동안 `Ctrl+Z`로 마지막 삭제를 되돌릴 수 있습니다. 새 텍스트를 복사하지 않고 목록을 열려면 `comment_on_copy.collection`에 단축키를 지정합니다.

메시지 액션은 비어 있지 않은 코멘트가 있어야 활성화됩니다. Collection에서는 체크한 모든 항목에 코멘트가 있어야 하며, send·submit에는 대상 에이전트도 필요합니다.

**Spaces**에 모드를 표시하려면 Herdr의 `config.toml`에서 기존 `[ui.sidebar.spaces].rows`에 `$comment_on_copy`를 추가합니다. 예시:

```toml
[ui.sidebar.spaces]
rows = [
  ["state_icon", "workspace", "$comment_on_copy"],
  ["branch", "git_status"],
]
```

레이아웃 수정 후 `herdr config check`와 `herdr server reload-config`를 실행합니다.

표시는 자동 감지 모드가 켜져 있고 사이드바가 펼쳐져 있을 때만 나타납니다. 접힌 사이드바와 모바일 레이아웃에서는 사용자 정의 Spaces 토큰이 표시되지 않습니다. 기본값은 `[c]`이며 Nerd Font가 필요하지 않습니다. Nerd Font에서 <img src="docs/comment.svg" width="16" height="16" alt="comment icon"> (`U+EA6B`)를 쓰려면 `herdr plugin config-dir comment_on_copy`로 확인한 디렉터리의 `config.toml`에 `indicator = "\uea6b"`를 추가합니다. `COMMENT_ON_COPY_INDICATOR` 환경 변수가 이 설정보다 우선합니다. 코드를 수정하면 모드를 껐다 켭니다.

복사·전송 결과는 `context`, `selection`, `comment` 블록으로 구분됩니다. Collection의 일괄 결과에서는 각 항목을 `item` 블록으로 감쌉니다.

| 키 | 동작 |
| --- | --- |
| Ctrl+S | 에이전트 입력란에 삽입 |
| Ctrl+E | 전송하고 제출 |
| Ctrl+Y | 결과 복사 |
| Ctrl+L | 에이전트 선택 |
| Ctrl+K | 저장하고 Collection 열기 |
| Tab | Comment / Collection 전환 |
| j / ↓, k / ↑ | 다음 / 이전 항목 또는 에이전트로 이동 (Collection / 대상 선택) |
| Enter | 대상 선택 확정 |
| Space / Ctrl+A | 항목 체크 / 전체 체크 전환 (Collection) |
| Ctrl+D / Ctrl+Z | 체크한 항목 삭제 / 삭제 되돌리기 (Collection) |
| PageUp / PageDown | 선택한 텍스트 스크롤 |
| Esc | 닫기 / 대상 선택 취소 |

켜진 동안에는 붙여넣기용 복사도 팝업을 엽니다. macOS와 Windows에서는 같은 텍스트를 다시 복사해도 감지합니다. Linux에서는 텍스트 변경을 감지하므로 동일한 내용의 재복사는 수동 액션을 사용합니다.

감지 결과와 누락 사유는 복사한 텍스트 없이 `capture.log`에 기록하며, 보조 프로세스/API 오류는 `watch.log`에 남깁니다. 파일 위치는 macOS/Linux의 `~/.local/state/herdr/plugins/comment_on_copy`, Windows의 `%LOCALAPPDATA%\herdr\plugins\comment_on_copy`입니다 (`XDG_STATE_HOME`으로 상태 경로를 바꿀 수 있습니다).

## 로컬 개발

로컬 저장소에서:

```sh
bun run scripts/run.ts install
herdr plugin link .
```

타입 검사와 회귀 테스트:

```sh
bun run scripts/run.ts check
```

코드를 수정하면 모드를 껐다 켭니다. 저장소를 이동하거나 삭제하기 전에 팝업을 닫습니다.

실행 스크립트는 `~/.local/bin/bun`, `~/.bun/bin/bun`도 확인합니다(Windows는 `bun.exe`). `COMMENT_ON_COPY_BUN`으로 실행 파일을 지정할 수 있습니다. 인식되지 않는 터미널의 프로세스 이름은 `COMMENT_ON_COPY_TERMINALS`에 쉼표로 구분해 추가합니다.

[기여 안내](CONTRIBUTING.md) · [MIT](LICENSE). 아이콘: [Microsoft Codicons](https://github.com/microsoft/vscode-codicons) ([CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)).
