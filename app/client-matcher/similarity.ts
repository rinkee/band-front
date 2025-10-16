// Front-end safe similarity helpers (no Node/Deno APIs)

export function normalizeText(input: string): string {
  if (!input) return "";
  try {
    let out = input
      .toLowerCase()
      .replace(/<band:refer[^>]*>.*?<\/band:refer>\s*/g, "")
      .replace(/[~!@#$%^&*()_+\-=`{}\[\]:;"'<>?,./\\|]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    // lightweight synonyms / variants
    const REPLACEMENTS: Array<[RegExp, string]> = [
      [/\b무우\b/g, '무'],
      [/\b메론\b/g, '멜론'],
      [/\b브로컬리\b/g, '브로콜리'],
      [/\b오랜지\b/g, '오렌지'],
      [/\b로메인\s*상추\b/g, '로메인상추'],
      [/\b상추\s*\(\s*적\s*\)\b/g, '적상추'],
      [/\b\(\s*소\s*\)/g, ' 소'], // 양배추(소) → 양배추 소
    ];
    for (const [re, rep] of REPLACEMENTS) out = out.replace(re, rep);
    return out;
  } catch (_) {
    return String(input || "").toLowerCase();
  }
}

export function tokenize(input: string): string[] {
  const t = normalizeText(input);
  if (!t) return [];
  // keep basic Korean/English/numeric tokens
  return t
    .split(/\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 1);
}

export function jaccardSimilarity(a: string, b: string): number {
  const ta = new Set(tokenize(a));
  const tb = new Set(tokenize(b));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  ta.forEach((t) => {
    if (tb.has(t)) inter += 1;
  });
  const union = ta.size + tb.size - inter;
  return union > 0 ? inter / union : 0;
}

export function containsLoose(haystack: string, needle: string): boolean {
  const h = normalizeText(haystack);
  const n = normalizeText(needle);
  return !!h && !!n && h.includes(n);
}

export function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

// --- Additional character-level similarity (Dice / Sorensen-Dice) ---

function charNgrams(s: string, n = 2): string[] {
  const t = normalizeText(s).replace(/\s+/g, '');
  if (!t || t.length < n) return t ? [t] : [];
  const out: string[] = [];
  for (let i = 0; i <= t.length - n; i++) out.push(t.slice(i, i + n));
  return out;
}

export function diceCoefficient(a: string, b: string, n = 2): number {
  const A = charNgrams(a, n);
  const B = charNgrams(b, n);
  if (A.length === 0 || B.length === 0) return 0;
  const map = new Map<string, number>();
  for (const g of A) map.set(g, (map.get(g) || 0) + 1);
  let inter = 0;
  for (const g of B) {
    const c = map.get(g) || 0;
    if (c > 0) {
      inter += 1;
      map.set(g, c - 1);
    }
  }
  return clamp01((2 * inter) / (A.length + B.length));
}
