# Comment on Copy

[English](README.md) · [한국어](README.ko.md) · [简体中文](README.zh-CN.md) · [日本語](README.ja.md)

복사한 터미널 텍스트에 코멘트를 덧붙이고, 문맥과 함께 [Herdr](https://herdr.dev)의 AI 에이전트로 보내는 플러그인입니다. 문맥에는 Herdr 출처와 코멘트를 열 때 수집한 pane 정보, 전경 프로그램이 포함됩니다.

필수: Herdr 0.9.0+, `PATH`에서 실행 가능한 Bun 1.3.0+. 원본 파일 탐색에는 `rg`를 선택적으로 사용합니다.

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
> 드래그로 텍스트를 선택할 때 팝업이 자동으로 열리려면, Herdr의 `[ui]`에서 `copy_on_select = true`가 설정되어 있고 `prefix+f`로 모드가 켜져 있어야 합니다.

Herdr의 `config.toml`에서 기존 `[ui]` 항목을 수정하고 `prefix+f` 단축키를 추가합니다(`f`는 feedback, 피드백):

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

프리픽스 키 다음 `f`를 눌러 켜거나 끕니다. 켜진 상태에서 Herdr pane에 있는 새 텍스트를 복사하면 팝업이 열립니다. Spaces의 `$comment_on_copy` 토큰으로 모드를 표시할 수 있습니다. WezTerm, Ghostty, Windows Terminal, kitty, Alacritty 등 주요 터미널을 지원합니다.

수동으로 열려면 위와 같은 형식으로 `comment_on_copy.open`에 단축키를 지정합니다. 선택한 텍스트를 사용하고, 선택이 없으면 클립보드를 사용합니다. 다른 Wayland 환경에서도 사용할 수 있으며, 선택한 텍스트에는 클립보드 도구가 필요하지 않습니다.

`Ctrl+K`는 선택 텍스트·코멘트(비어 있어도 가능)·원래 context를 저장하고 **Collection** 탭으로 이동합니다. 새 항목은 포커스만 받고 체크되지는 않습니다. `Tab` 또는 탭 클릭으로 전환하며 초안과 체크 상태는 유지됩니다. Collection에서 방향키로 탐색하고 `Space` 또는 항목 클릭으로 체크합니다. `Ctrl+S/E/Y`는 체크한 항목들을 수집 순서대로 하나의 메시지로 묶어 처리하고, `Ctrl+L`은 전체를 받을 에이전트를 선택합니다. 항목은 재시작 및 액션 처리 후에도 로컬에 보관됩니다. `Delete`로 체크한 항목을 삭제하고, 팝업이 열린 동안 `Ctrl+Z`로 마지막 삭제를 되돌릴 수 있습니다. 새 텍스트를 복사하지 않고 목록을 열려면 `comment_on_copy.collection`에 단축키를 지정합니다.

기본 표시는 `[c]`입니다. Nerd Font에서 <img src="docs/comment.svg" width="16" height="16" alt="comment icon"> (`U+EA6B`)를 쓰려면 `herdr plugin config-dir comment_on_copy`로 확인한 디렉터리의 `config.toml`에 `indicator = "\uea6b"`를 추가합니다. `COMMENT_ON_COPY_INDICATOR` 환경 변수가 이 설정보다 우선합니다. 코드를 수정하면 모드를 껐다 켭니다.

| 키 | 동작 |
| --- | --- |
| Ctrl+S | 에이전트 입력란에 삽입 |
| Ctrl+E | 전송하고 제출 |
| Ctrl+Y | 결과 복사 |
| Ctrl+L | 에이전트 선택 |
| Ctrl+K | 저장하고 Collection 열기 |
| Tab | Comment / Collection 전환 |
| Space / Ctrl+A | 항목 체크 / 전체 체크 전환 (Collection) |
| Delete / Ctrl+Z | 체크한 항목 삭제 / 삭제 되돌리기 (Collection) |
| PageUp / PageDown | 선택한 텍스트 스크롤 |
| Esc | 닫기 |

최근 복사한 값의 중복은 무시합니다. 켜진 동안에는 붙여넣기용 복사도 팝업을 엽니다.

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
