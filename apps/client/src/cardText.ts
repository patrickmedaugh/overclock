// S-12-6: how a card's printed text is drawn (display only; no rules here).

/**
 * The click cost at the start of a card's text written as words ("Click, click, click: Gain 7
 * credits."), as a count and the text after it; null for none or a single click (a lone
 * "Click:" stays a word). Display only: the engine's ability holds the real cost.
 */
export function clickCostOf(text: string): { count: number; rest: string } | null {
  const m = /^Click(?:, click)+: /.exec(text);
  if (!m) return null;
  return { count: m[0].split(',').length, rest: text.slice(m[0].length) };
}
