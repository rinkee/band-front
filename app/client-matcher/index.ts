// Front-end Comment → Product suggestion matcher (browser-safe)
// Purpose: given a comment and products, return Top-N product suggestions with quantities

import { jaccardSimilarity, normalizeText, tokenize, clamp01, containsLoose, diceCoefficient } from './similarity';

export type ClientMatcherProduct = {
  itemNumber?: number;
  title?: string | null;
  name?: string | null;
  quantityText?: string | null; // e.g., "1개", "1박스", "5kg"
  price?: number | null;
  keywords?: string[] | null; // optional product-specific keywords
};

export type ClientMatcherSuggestion = {
  itemNumber: number;
  productName: string;
  quantity: number;
  confidence: number; // 0..1
  reason?: string;
  matchMethod?: string;
};

export type AnalyzeCommentOptions = {
  maxSuggestions?: number; // default 3
  isSingleProduct?: boolean; // if known
};

export function buildProductMap(products: ClientMatcherProduct[]): Map<number, Required<ClientMatcherProduct>> {
  const map = new Map<number, Required<ClientMatcherProduct>>();
  products.forEach((p, idx) => {
    const num = (p.itemNumber && Number.isFinite(p.itemNumber)) ? (p.itemNumber as number) : (idx + 1);
    map.set(num, {
      itemNumber: num,
      title: p.title || p.name || '',
      name: p.name || p.title || '',
      quantityText: p.quantityText || null,
      price: (typeof p.price === 'number' ? p.price : null),
    });
  });
  return map;
}

// --- internal helpers ---

const KOREAN_NUMBER_MAP: Record<string, number> = {
  '하나': 1, '한': 1, '한개': 1, '한 개': 1, '한박스': 1, '한 박스': 1,
  '둘': 2, '두': 2, '두개': 2, '두 개': 2, '두박스': 2, '두 박스': 2,
  '셋': 3, '세': 3, '세개': 3, '세 개': 3, '세박스': 3, '세 박스': 3,
  '넷': 4, '네': 4, '네개': 4, '네 개': 4, '네박스': 4, '네 박스': 4,
  '다섯': 5,
};

const UNIT_VARIANTS: Record<string, string[]> = {
  '개': ['개'],
  '박스': ['박스', '상자', '곽'],
  '봉지': ['봉지', '봉', '망'],
  '팩': ['팩', '포', '세트', '묶음', '꾸러미'],
  '통': ['통'],
  '병': ['병'],
  '캔': ['캔'],
  '컵': ['컵'],
  'kg': ['kg', '키로', '킬로', 'k'],
};

function looksLikePhoneNumber(n: string): boolean {
  // crude phone pattern: 3-4+ digits or starting with 0 followed by ≥3 digits
  if (!n) return false;
  if (/^0\d{3,}$/.test(n)) return true; // 0xxx ...
  if (/^\d{4,}$/.test(n)) return true;  // 4+ digits
  return false;
}

function extractNumberFromText(comment: string): number | null {
  const m = comment.match(/^(\d+)$/);
  if (m) {
    if (!looksLikePhoneNumber(m[1])) return parseInt(m[1]);
    return null;
  }
  const m2 = comment.match(/(\d+)\s*(개|박스|봉지|팩|통|세트|kg|키로)$/);
  if (m2) {
    if (!looksLikePhoneNumber(m2[1])) return parseInt(m2[1]);
    return null;
  }
  // hangul numbers
  for (const [k, v] of Object.entries(KOREAN_NUMBER_MAP)) {
    if (comment.includes(k)) return v;
  }
  return null;
}

function extractQuantity(comment: string): number | null {
  const m = comment.match(/(\d+)\s*(개|박스|봉지|팩|통|세트|kg|키로)/);
  if (m) {
    if (!looksLikePhoneNumber(m[1])) return clampQty(parseInt(m[1]));
  }
  for (const [k, v] of Object.entries(KOREAN_NUMBER_MAP)) {
    if (comment.includes(k)) return clampQty(v);
  }
  const tail = comment.match(/(\d+)$/);
  if (tail && !looksLikePhoneNumber(tail[1])) return clampQty(parseInt(tail[1]));
  return null;
}

function clampQty(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(99, Math.floor(n)));
}

// Matcher 1: number-based → "N번", "N번 M개"
function matchNumberBased(comment: string, productMap: Map<number, Required<ClientMatcherProduct>>): ClientMatcherSuggestion[] {
  const out: ClientMatcherSuggestion[] = [];
  const re = /(\d+)\s*번(?:\s*(\d+)\s*(?:개|박스|봉지|팩|통|세트)?)?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(comment)) !== null) {
    const num = parseInt(m[1]);
    const qty = m[2] ? clampQty(parseInt(m[2])) : 1;
    const prod = productMap.get(num);
    if (prod) {
      const name = prod.title || prod.name || `상품 ${num}`;
      out.push({ itemNumber: num, productName: name, quantity: qty, confidence: 0.95, reason: '번호 기반', matchMethod: 'number-based' });
    }
  }
  return out;
}

// Matcher 2: product name similarity (with optional quantity in comment)
function matchProductName(comment: string, productMap: Map<number, Required<ClientMatcherProduct>>): ClientMatcherSuggestion[] {
  const normalized = normalizeText(comment);
  const qty = extractQuantity(normalized) || 1;
  const sims: Array<{ num: number; name: string; score: number }> = [];
  productMap.forEach((p, num) => {
    const name = p.title || p.name || '';
    // incorporate product keywords when provided
    const alt = Array.isArray((p as any).keywords) ? (p as any).keywords!.join(' ') : '';
    const ref = alt ? `${name} ${alt}` : name;
    const j = jaccardSimilarity(normalized, ref);
    const d = diceCoefficient(normalized, ref, 2);
    const score = j * 0.5 + d * 0.5;
    if (score > 0) sims.push({ num, name, score });
  });
  sims.sort((a, b) => b.score - a.score);
  return sims.slice(0, 3).map(({ num, name, score }) => ({
    itemNumber: num,
    productName: name,
    quantity: qty,
    confidence: clamp01(0.6 + Math.min(0.4, score)),
    reason: '상품명 유사도',
    matchMethod: 'product-name',
  }));
}

// Matcher 3: unit pattern → "N개/박스/봉지" + unit-aware product title
function matchUnitPattern(comment: string, productMap: Map<number, Required<ClientMatcherProduct>>): ClientMatcherSuggestion[] {
  const normalized = normalizeText(comment);
  const m = normalized.match(/(\d+)\s*(개|박스|봉지|팩|통|세트|kg|키로)/);
  if (!m) return [];
  const qty = clampQty(parseInt(m[1]));
  const unit = m[2];
  const candidates: Array<{ num: number; name: string; score: number }> = [];
  productMap.forEach((p, num) => {
    const name = p.title || p.name || '';
    let hit = 0;
    const variants = UNIT_VARIANTS[unit] || [unit];
    for (const v of variants) {
      if (containsLoose(name, v)) { hit = 1; break; }
    }
    const base = jaccardSimilarity(normalized, name);
    const score = base + (hit ? 0.2 : 0);
    if (score > 0) candidates.push({ num, name, score });
  });
  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, 3).map(({ num, name, score }) => ({
    itemNumber: num,
    productName: name,
    quantity: qty,
    confidence: clamp01(0.55 + Math.min(0.4, score)),
    reason: `단위 패턴(${unit})`,
    matchMethod: 'unit-pattern',
  }));
}

// Matcher 4: simple number for single-product → "3", "3개", "하나" 등
function matchSimpleNumber(comment: string, productMap: Map<number, Required<ClientMatcherProduct>>, isSingle: boolean): ClientMatcherSuggestion[] {
  if (!isSingle) return [];
  const n = extractNumberFromText(comment);
  if (!n) return [];
  const [first] = Array.from(productMap.values());
  if (!first) return [];
  const name = first.title || first.name || '상품';
  return [{ itemNumber: first.itemNumber, productName: name, quantity: clampQty(n), confidence: 0.9, reason: '단일상품 수량', matchMethod: 'simple-number' }];
}

function decideOrder(comment: string): Array<'number-based' | 'unit-pattern' | 'product-name' | 'simple-number'> {
  const t = normalizeText(comment);
  const list: Array<'number-based' | 'unit-pattern' | 'product-name' | 'simple-number'> = [];
  if (/\d+\s*번/.test(t)) list.push('number-based');
  if (/(\d+)\s*(개|박스|봉지|팩|통|세트|kg|키로)/.test(t)) list.push('unit-pattern');
  if (/[가-힣]{2,}/.test(t)) list.push('product-name');
  if (/^(\d+|한|하나|두|둘|세|셋|네|넷)(\s*(개|박스|봉지|팩))?$/.test(t)) list.push('simple-number');
  if (list.length === 0) list.push('product-name');
  return list;
}

export function analyzeComment(
  comment: string,
  products: ClientMatcherProduct[] | Map<number, ClientMatcherProduct>,
  opts: AnalyzeCommentOptions = {}
): ClientMatcherSuggestion[] {
  const productMap = products instanceof Map ? buildProductMap(Array.from(products.values())) : buildProductMap(products);
  const isSingle = opts.isSingleProduct ?? (productMap.size === 1);
  const order = decideOrder(comment);
  const collected: ClientMatcherSuggestion[] = [];
  for (const key of order) {
    if (key === 'number-based') collected.push(...matchNumberBased(comment, productMap));
    else if (key === 'unit-pattern') collected.push(...matchUnitPattern(comment, productMap));
    else if (key === 'product-name') collected.push(...matchProductName(comment, productMap));
    else if (key === 'simple-number') collected.push(...matchSimpleNumber(comment, productMap, isSingle));
  }
  // dedupe by itemNumber, keep highest confidence
  const bestByItem = new Map<number, ClientMatcherSuggestion>();
  for (const s of collected) {
    const cur = bestByItem.get(s.itemNumber);
    if (!cur || s.confidence > cur.confidence) bestByItem.set(s.itemNumber, s);
  }
  const suggestions = Array.from(bestByItem.values()).sort((a, b) => b.confidence - a.confidence);
  const maxSuggestions = opts.maxSuggestions ?? 3;
  return suggestions.slice(0, maxSuggestions);
}

export type AnalyzeCommentsInput = {
  id?: string;
  text: string;
};

export type AnalyzeCommentsResult = {
  byComment: Record<string, ClientMatcherSuggestion[]>;
  countsByProduct: Record<number, { predictedQuantity: number; comments: string[] }>; // simple top-1 tally
};

export function analyzeComments(
  comments: AnalyzeCommentsInput[],
  products: ClientMatcherProduct[] | Map<number, ClientMatcherProduct>,
  opts: AnalyzeCommentOptions = {}
): AnalyzeCommentsResult {
  const byComment: Record<string, ClientMatcherSuggestion[]> = {};
  const counts = new Map<number, { predictedQuantity: number; comments: string[] }>();
  comments.forEach((c, idx) => {
    const key = c.id || String(idx);
    const sugg = analyzeComment(c.text || '', products, opts);
    byComment[key] = sugg;
    const top = sugg[0];
    if (top) {
      const cur = counts.get(top.itemNumber) || { predictedQuantity: 0, comments: [] };
      cur.predictedQuantity += top.quantity;
      cur.comments.push(key);
      counts.set(top.itemNumber, cur);
    }
  });
  const countsByProduct: AnalyzeCommentsResult['countsByProduct'] = {};
  counts.forEach((v, k) => { countsByProduct[k] = v; });
  return { byComment, countsByProduct };
}

// --- Multi-item extractor for a single comment (e.g., "쪽파김치1, 열무김치1, 오이소박이1") ---

function afterLastSlash(text: string): string {
  const i = text.lastIndexOf('/')
  return i >= 0 ? text.slice(i + 1) : text;
}

function splitFragments(text: string): string[] {
  const base = afterLastSlash(normalizeText(text));
  // split by common separators: comma, middot, bullet
  return base
    .split(/[\s]*[,·•]+[\s]*/g)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function pickBest(suggestions: ClientMatcherSuggestion[], max = 1): ClientMatcherSuggestion[] {
  const sorted = [...suggestions].sort((a, b) => b.confidence - a.confidence);
  return sorted.slice(0, max);
}

export function analyzeCommentMulti(
  comment: string,
  products: ClientMatcherProduct[] | Map<number, ClientMatcherProduct>,
  opts: AnalyzeCommentOptions = {}
): ClientMatcherSuggestion[] {
  const productMap = products instanceof Map ? buildProductMap(Array.from(products.values())) : buildProductMap(products);
  const fragments = splitFragments(comment);
  const collected: ClientMatcherSuggestion[] = [];
  const isSingle = opts.isSingleProduct ?? (productMap.size === 1);
  // For each fragment, run number/unit/name matchers in that order, pick best
  for (const frag of fragments) {
    const agg: ClientMatcherSuggestion[] = [];
    agg.push(...matchNumberBased(frag, productMap));
    agg.push(...matchUnitPattern(frag, productMap));
    agg.push(...matchProductName(frag, productMap));
    if (agg.length === 0) {
      agg.push(...matchSimpleNumber(frag, productMap, isSingle));
    }
    const best = pickBest(agg, 1);
    collected.push(...best);
  }
  // Deduplicate by itemNumber by summing quantities for identical items across fragments
  const merged = new Map<number, ClientMatcherSuggestion>();
  for (const s of collected) {
    const cur = merged.get(s.itemNumber);
    if (!cur) {
      merged.set(s.itemNumber, { ...s });
    } else {
      merged.set(s.itemNumber, { ...cur, quantity: cur.quantity + s.quantity, confidence: Math.max(cur.confidence, s.confidence) });
    }
  }
  return Array.from(merged.values()).sort((a, b) => b.confidence - a.confidence);
}
