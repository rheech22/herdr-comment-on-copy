# Contributing

Bug reports, focused fixes, platform testing, and translations are welcome.

## Development

Use Bun 1.3.0+ (CI uses 1.4.2) and `rg`. Herdr 0.9.0+ is needed for manual testing. See the [README](README.md) for OS-specific clipboard tools.

From your checkout:

```sh
bun run scripts/run.ts install
bun run scripts/run.ts check
herdr plugin link .
```

Configure the shortcut described in the README, then run `herdr config check` and `herdr server reload-config`. Toggle the mode off and on after code changes. Close popups and stop the mode before moving or removing the checkout.

## Validation

`check` runs TypeScript checks and regression tests for capture, asynchronous context updates, delivery, process cleanup, IPC, and OpenTUI rendering and input. It also executes the manifest's build and action commands with Bun absent from `PATH`. Herdr API responses are simulated in these tests. The macOS helper test uses an isolated named pasteboard and leaves the general clipboard untouched.

[CI](.github/workflows/check.yml) runs on macOS, Windows, and Linux. It enables native clipboard tests with `COMMENT_ON_COPY_NATIVE_TESTS=1`; Linux uses Xvfb for X11. These tests replace clipboard contents and restore the original plain text. Native clipboard tests are skipped by default locally.

For clipboard or UI changes, also test in Herdr with your terminal. Confirm capture, Unicode and multiline text, insertion, submission, copying, closing, and mode shutdown as relevant. Report the terminal and OS tested. Font rendering and actual Sway/Hyprland sessions need manual verification.

## Issues and pull requests

- For bugs, include reproduction steps, expected and actual behavior, OS, terminal, Herdr/Bun versions, and X11/Wayland compositor when relevant. Remove private copied text from logs or screenshots.
- Keep PRs focused. Explain the resulting behavior and list checks run, including any platform you could not test. Add a regression test when it helps catch the reported bug.
- Keep dependencies and configuration minimal. Update affected documentation; keep the four README translations consistent.

Contributions are provided under the project's [MIT license](LICENSE).
