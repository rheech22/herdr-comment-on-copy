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

Herdr의 `config.toml`에 `prefix+f` 단축키를 추가합니다(`f`는 feedback, 피드백):

```toml
[[keys.command]]
key = "prefix+f"
type = "plugin_action"
command = "comment_on_copy.toggle"
```

`herdr config check`와 `herdr server reload-config`를 실행합니다. 텍스트 선택 시 팝업을 열려면 `[ui]`의 `copy_on_select = true`를 설정합니다.

## 사용

프리픽스 키 다음 `f`를 눌러 켜거나 끕니다. 켜진 상태에서 Herdr pane에 있는 새 텍스트를 복사하면 팝업이 열립니다. Spaces의 `$comment_on_copy` 토큰으로 모드를 표시할 수 있습니다. WezTerm, Ghostty, Windows Terminal, kitty, Alacritty 등 주요 터미널을 지원합니다.

수동으로 열려면 위와 같은 형식으로 `comment_on_copy.open`에 단축키를 지정합니다. 선택한 텍스트를 사용하고, 선택이 없으면 클립보드를 사용합니다. 다른 Wayland 환경에서도 사용할 수 있으며, 선택한 텍스트에는 클립보드 도구가 필요하지 않습니다.

기본 표시는 `[c]`입니다. Nerd Font에서 ``를 쓰려면 `herdr plugin config-dir comment_on_copy`로 확인한 디렉터리의 `config.toml`에 `indicator = ""`를 추가합니다. `COMMENT_ON_COPY_INDICATOR` 환경 변수가 이 설정보다 우선합니다. 코드를 수정하면 모드를 껐다 켭니다.

| 키 | 동작 |
| --- | --- |
| Ctrl+S | 에이전트 입력란에 삽입 |
| Ctrl+E | 전송하고 제출 |
| Ctrl+Y | 결과 복사 |
| Ctrl+L | 에이전트 선택 |
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

[기여 안내](CONTRIBUTING.md) · [MIT](LICENSE).
