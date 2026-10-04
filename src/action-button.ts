import { TextRenderable, type CliRenderer, type MouseEvent } from "@opentui/core";

/** The same availability check controls appearance, clicks, and shortcuts. */
export class ActionButton extends TextRenderable {
  constructor(renderer: CliRenderer, options: {
    id: string; label: string; enabled: () => boolean;
    action: (event?: MouseEvent) => void; color?: string; disabledColor: string;
  }) {
    super(renderer, {
      id: options.id, content: options.label, height: 1, flexShrink: 0, fg: options.disabledColor,
      onMouseDown: event => { if (event.button === 0) this.invoke(event); },
    });
    this.options = options;
  }
  private readonly options;
  get enabled(): boolean { return this.options.enabled(); }
  invoke(event?: MouseEvent) { if (this.enabled) this.options.action(event); }
  update() { this.fg = this.enabled ? this.options.color || "#ffffff" : this.options.disabledColor; }
}
