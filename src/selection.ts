// Compare application-owned Markdown copies with text rendered by a terminal.
function normalize(line: string) {
  return line.normalize("NFC")
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/!?(\[[^\]]*\])\([^)]*\)/g, label => label.slice(label.indexOf("[") + 1, label.indexOf("]")))
    .replace(/^\s*(?:#{1,6}\s+|>\s*|[-+*•]\s+|\d+[.)]\s+)/, "")
    .replace(/\\([\\`*_{}\[\]()#+.!|>-])/g, "$1")
    .replace(/[`*_~|│┃]/g, "")
    .replace(/\s+/gu, "");
}

/** A useful later line can establish the source even if a prefix or border cannot. */
export function matchSelection(text: string, screen: string): { row?: number } | null {
  const candidates = text.trim().split(/\r?\n/).slice(0, 128).map((line, index) => ({ needle: normalize(line), index }))
    .filter(({ needle }) => (needle.match(/[\p{L}\p{N}]/gu) || []).length >= 4).slice(0, 32);
  if (!candidates.length) return null;
  const rows = screen.split("\n").map(normalize);
  const joined = rows.join("");
  const matched = new Set<string>();
  for (const { needle, index } of candidates) {
    // Short labels should not identify a multi-line selection on their own.
    const offset = needle.length >= 12 ? joined.indexOf(needle) : -1;
    const line = rows.findIndex(row => row.includes(needle));
    if (offset < 0 && line < 0) continue;
    matched.add(needle);
    if (needle.length < 12 && candidates.length > 1 && matched.size < 2) continue;
    if (index !== 0) return {}; // Do not invent the selection's starting screen row.
    if (line >= 0) return { row: line };
    let start = 0;
    for (let row = 0; row < rows.length; row++) {
      const end = start + rows[row]!.length;
      if (offset < end) return { row };
      start = end;
    }
  }
  return null;
}
