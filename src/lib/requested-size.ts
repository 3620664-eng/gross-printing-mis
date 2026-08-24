/**
 * Deterministic finished-size parsing for customer email text.
 *
 * Staff should not need an AI round trip before the MIS can tell them what size
 * a customer asked for. A sentence like "I need a vinyl sign 3 feet by 4 feet"
 * carries the finished size in plain text, so it is read here directly and fed
 * straight into artwork preflight when an email is opened.
 *
 * The two parsers that previously existed did not cover real customer wording:
 * `ai-pricing-server` only understood inches, and `public-pricing-server` only
 * treated a size as feet when a `'` appeared with no `"` anywhere in the string.
 * Neither one reads "3 feet by 4 feet".
 */

export type SizeUnit = "in" | "ft" | "mm" | "cm" | "m";

export type SizeConfidence = "high" | "medium" | "low";

export interface ParsedRequestedSize {
  /** Finished width, normalized to inches. */
  widthInches: number;
  /** Finished height, normalized to inches. */
  heightInches: number;
  /** Unit as the customer actually wrote it, for quoting it back to them. */
  unit: SizeUnit;
  /** Width in the customer's own unit. */
  width: number;
  /** Height in the customer's own unit. */
  height: number;
  /** The exact substring that produced this size. */
  raw: string;
  /** Offset of `raw` within the searched text. */
  index: number;
  confidence: SizeConfidence;
  /** True when the customer labelled which side is which ("4 feet wide by 3 feet tall"). */
  orientationStated: boolean;
}

const UNIT_IN_INCHES: Record<SizeUnit, number> = {
  in: 1,
  ft: 12,
  mm: 1 / 25.4,
  cm: 1 / 2.54,
  m: 39.3700787
};

/** Largest finished size the shop can plausibly be asked for, in inches. */
const MAX_PLAUSIBLE_INCHES = 100 * 12;
/** Smallest finished size worth treating as a real request, in inches. */
const MIN_PLAUSIBLE_INCHES = 0.25;

const NUMBER = String.raw`\d+(?:\.\d+)?(?:\s*[-\s]\s*\d+\/\d+)?|\d+\/\d+`;
const UNIT = String.raw`in\b|inch(?:es)?\b|"|”|″|ft\b|foot\b|feet\b|'|’|′|mm\b|millimet(?:er|re)s?\b|cm\b|centimet(?:er|re)s?\b|m\b|met(?:er|re)s?\b`;
const WIDTH_WORD = String.raw`wide|width|w\b|across`;
const HEIGHT_WORD = String.raw`tall|high|height|h\b|long|length|deep`;

const SIZE_PATTERN = new RegExp(
  String.raw`(${NUMBER})\s*(${UNIT})?\s*(?:(${WIDTH_WORD})\s*)?(?:x|×|✕|by)\s*(${NUMBER})\s*(${UNIT})?\s*(?:(${HEIGHT_WORD})\b)?`,
  "gi"
);

/**
 * Units that must never be read as a finished size. "300 x 300 dpi" is a
 * resolution and "1920 x 1080 px" is a screen, not something the shop prints.
 */
const NON_SIZE_TRAILER = /^\s*(?:dpi|ppi|px|pixels?|k\b|mb\b|gb\b)/i;

/**
 * An explicit quantity marker directly before the pair, as in "qty 250 x 2".
 * Only unambiguous markers belong here: words like "print" and "copies" read as
 * a quantity but routinely introduce a real size ("250 copies of 8.5 x 11").
 */
const QUANTITY_LEAD = /\b(?:qty|quantity)\s*(?:of|:)?\s*$/i;

/**
 * Count wording directly after the pair, as in "2 x 2 sides". This only rejects
 * a pair that stated no unit, so "3 ft x 4 ft, 2 sides" is still a size.
 */
const QUANTITY_TRAILER = /^\s*(?:sides?|sets?|copies|pieces?|pcs?|each|ea\b|up\b)/i;

function parseNumber(raw: string): number | undefined {
  const text = raw.trim();

  // "8 1/2" and "8-1/2" are both normal ways to write a half inch.
  const mixed = text.match(/^(\d+)\s*[-\s]\s*(\d+)\/(\d+)$/);
  if (mixed) {
    const denominator = Number(mixed[3]);
    if (!denominator) return undefined;
    return Number(mixed[1]) + Number(mixed[2]) / denominator;
  }

  const fraction = text.match(/^(\d+)\/(\d+)$/);
  if (fraction) {
    const denominator = Number(fraction[2]);
    return denominator ? Number(fraction[1]) / denominator : undefined;
  }

  const plain = Number(text);
  return Number.isFinite(plain) ? plain : undefined;
}

function normalizeUnit(raw?: string): SizeUnit | undefined {
  if (!raw) return undefined;
  const value = raw.trim().toLowerCase();
  if (value === '"' || value === "”" || value === "″") return "in";
  if (value === "'" || value === "’" || value === "′") return "ft";
  if (value.startsWith("inch") || value === "in") return "in";
  if (value === "ft" || value === "foot" || value === "feet") return "ft";
  if (value === "mm" || value.startsWith("milli")) return "mm";
  if (value === "cm" || value.startsWith("centi")) return "cm";
  if (value === "m" || value.startsWith("met")) return "m";
  return undefined;
}

function plausible(inches: number) {
  return inches >= MIN_PLAUSIBLE_INCHES && inches <= MAX_PLAUSIBLE_INCHES;
}

/**
 * Read every finished size mentioned in a block of text, best candidate first.
 */
export function parseRequestedSizes(text?: string): ParsedRequestedSize[] {
  if (!text) return [];
  const source = text.replace(/ /g, " ");
  const results: ParsedRequestedSize[] = [];

  SIZE_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = SIZE_PATTERN.exec(source)) !== null) {
    const [raw, widthRaw, widthUnitRaw, widthWord, heightRaw, heightUnitRaw, heightWord] = match;

    const before = source.slice(Math.max(0, match.index - 24), match.index);
    const after = source.slice(match.index + raw.length);

    // A price or a count that happens to contain "x" is not a finished size.
    if (/[$€£]\s*$/.test(before)) continue;
    if (QUANTITY_LEAD.test(before)) continue;
    if (NON_SIZE_TRAILER.test(after)) continue;
    // Guard against reading a date or a version string as a pair of dimensions.
    if (/[\d]\s*[\/.-]\s*$/.test(before)) continue;

    const width = parseNumber(widthRaw);
    const height = parseNumber(heightRaw);
    if (width === undefined || height === undefined || width <= 0 || height <= 0) continue;

    // A unit written on one side applies to both: "3 x 4 feet" means both sides
    // are feet, and "3 feet x 4" means the same thing.
    const widthUnit = normalizeUnit(widthUnitRaw);
    const heightUnit = normalizeUnit(heightUnitRaw);
    const stated = widthUnit ?? heightUnit;
    const unit: SizeUnit = stated ?? "in";

    // "2 x 2 sides" is a count. With a unit spelled out it is a size regardless.
    if (!stated && QUANTITY_TRAILER.test(after)) continue;

    const widthInches = width * UNIT_IN_INCHES[widthUnit ?? unit];
    const heightInches = height * UNIT_IN_INCHES[heightUnit ?? unit];
    if (!plausible(widthInches) || !plausible(heightInches)) continue;

    // A spelled-out unit is a confident read, including a mixed pair such as
    // "3 feet x 48 inches". With no unit at all, a small pair is most likely a
    // size in inches, while a large bare pair is too ambiguous to trust.
    const confidence: SizeConfidence = stated
      ? "high"
      : widthInches <= 60 && heightInches <= 60
        ? "medium"
        : "low";

    results.push({
      widthInches,
      heightInches,
      unit,
      width,
      height,
      raw: raw.trim(),
      index: match.index,
      confidence,
      orientationStated: Boolean(widthWord || heightWord)
    });
  }

  const rank: Record<SizeConfidence, number> = { high: 0, medium: 1, low: 2 };
  return results.sort((a, b) => rank[a.confidence] - rank[b.confidence] || a.index - b.index);
}

/**
 * Best single finished size for a customer request. Subject line wins over body
 * text when both state a size, because customers put the real product in the
 * subject far more often than in a long body.
 */
export function parseRequestedSize(...parts: Array<string | undefined>): ParsedRequestedSize | undefined {
  for (const part of parts) {
    const found = parseRequestedSizes(part);
    const confident = found.find((item) => item.confidence === "high");
    if (confident) return confident;
  }
  for (const part of parts) {
    const found = parseRequestedSizes(part);
    if (found.length) return found[0];
  }
  return undefined;
}

/** Render a size the way the customer wrote it, for quoting back in a reply. */
export function formatSize(width: number, height: number, unit: SizeUnit = "in") {
  const label: Record<SizeUnit, string> = { in: '"', ft: " ft", mm: " mm", cm: " cm", m: " m" };
  return `${trimNumber(width)}${label[unit]} × ${trimNumber(height)}${label[unit]}`;
}

export function trimNumber(value: number, digits = 2) {
  if (!Number.isFinite(value)) return "—";
  const rounded = Number(value.toFixed(digits));
  return String(rounded);
}

/** Convert inches back into the unit the customer used, for a natural reply. */
export function fromInches(inches: number, unit: SizeUnit) {
  return inches / UNIT_IN_INCHES[unit];
}
