const fillerWords = new Set([
  "לי",
  "בבקשה",
  "בבקשהה",
  "תודה",
  "please",
  "pls",
  "رجاء",
  "من",
  "فضلك",
  "بدي",
  "بدّي",
  "ضيفلي",
  "اضف",
  "ضيف",
  "עוד",
  "קצת",
  "את",
  "של",
  "אני",
  "צריך",
  "צריכה",
]);

const tokenReplacements = new Map<string, string>([
  ["כמח", "קמח"],
  ["שמרימ", "שמרים"],
  ["sugar", "סוכר"],
  ["flour", "קמח"],
  ["yeast", "שמרים"],
  ["chocolate", "שוקולד"],
  ["سكر", "סוכר"],
  ["طحين", "קמח"],
  ["خميرة", "שמרים"],
  ["شوكولاتة", "שוקולד"],
  ["كريم", "קרם"],
  // Synonyms mapped toward the term the catalog actually uses (verified against
  // live product names): catalog has סולת (not סמיד), עמילן תירס (not
  // קורנפלור/פולנטה), וניל (not ונילין), גלטין (no apostrophe).
  ["סמיד", "סולת"],
  ["سميد", "סולת"],
  ["semolina", "סולת"],
  ["פולנטה", "תירס"],
  ["polenta", "תירס"],
  ["קורנפלור", "עמילן"],
  ["cornflour", "עמילן"],
  ["ונילין", "וניל"],
  ["גלטינה", "גלטין"],
  // QA scenario (Work Order Issue 6) — verified against live catalog names:
  // the catalog spells בקלאוה (one vav) and both סמנה/סמנת appear (fuzzy
  // distance-1 already bridges those two); cross-language ghee terms map to
  // the Hebrew catalog family.
  ["בקלאווה", "בקלאוה"],
  ["בקלווה", "בקלאוה"],
  ["baklava", "בקלאוה"],
  ["بقلاوة", "בקלאוה"],
  ["سمنة", "סמנה"],
  ["ghee", "סמנה"],
  ["samneh", "סמנה"],
]);

function sanitize(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, () => Array<number>(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i += 1) dp[i][0] = i;
  for (let j = 0; j <= b.length; j += 1) dp[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[a.length][b.length];
}

export type AssistantNormalizedText = {
  original: string;
  normalized: string;
  tokens: string[];
};

/**
 * Lightweight deterministic normalization for assistant shopping queries.
 * Handles common typos, filler words, and mixed Hebrew/Arabic/English tokens.
 */
export function normalizeAssistantText(input: string): AssistantNormalizedText {
  const original = input.trim();
  const cleaned = sanitize(original);
  const tokens = cleaned
    .split(" ")
    .filter(Boolean)
    .map((token) => tokenReplacements.get(token) ?? token)
    .filter((token) => !fillerWords.has(token));

  // Single-pass typo correction against known replacement keys/values.
  const dictionary = [...tokenReplacements.keys(), ...tokenReplacements.values()];
  const corrected = tokens.map((token) => {
    if (tokenReplacements.has(token)) return tokenReplacements.get(token) ?? token;
    let best = token;
    let bestDist = 2;
    for (const d of dictionary) {
      const dist = editDistance(token, d);
      if (dist < bestDist) {
        best = tokenReplacements.get(d) ?? d;
        bestDist = dist;
      }
    }
    return best;
  });

  return {
    original,
    normalized: corrected.join(" ").trim(),
    tokens: corrected,
  };
}
