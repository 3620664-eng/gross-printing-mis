/**
 * Printability checks for customer artwork.
 *
 * Preflight has until now answered one question: does the artwork's proportion
 * match the finished size the customer asked for. That is the question that
 * blocks a job, and it keeps that role. These checks answer the questions that
 * cost the shop a reprint rather than a delay — no bleed, a file that is too
 * low-resolution for the size it will be printed at, RGB artwork heading for a
 * CMYK press, a second page at a different size that nobody noticed.
 *
 * Findings are advisory on purpose. `ArtworkPreflightResult.severity` decides
 * whether staff is stopped from converting a ticket, and nothing here changes
 * it: adding a bleed warning must never wedge a job that would have gone
 * through before.
 *
 * Every rule reports only what was actually measured. Where a property cannot
 * be read from the file — colour space inside a PDF, for instance — the rule
 * returns nothing rather than guessing, because a confident wrong answer about
 * artwork is worse than no answer.
 */

import type { ArtworkFinding, ArtworkFindingLevel } from "./types";

/** Bleed the shop needs past the trim, in inches, on every edge. */
export const REQUIRED_BLEED_INCHES = 0.125;

/**
 * Lowest effective resolution worth printing, in dots per inch at finished
 * size. Wide-format work is viewed from across a room, so a sign holds up far
 * below the 300dpi a business card needs.
 */
const DPI_FLOOR_SMALL = 200;
const DPI_FLOOR_LARGE = 100;
/** Longest edge, in inches, below which a piece is treated as close-viewed. */
const CLOSE_VIEW_MAX_INCHES = 24;

export interface ArtworkMeasurements {
  /** Finished width the customer asked for, in inches. */
  requestedWidth?: number;
  requestedHeight?: number;
  /** Measured artwork size, in inches. */
  artworkWidth?: number;
  artworkHeight?: number;
  /** Pixel dimensions, for raster artwork only. */
  pixelWidth?: number;
  pixelHeight?: number;
  /** Every page's size in inches, for multi-page PDFs. */
  pageSizes?: Array<{ width: number; height: number }>;
  /**
   * Smallest inset between the media box and the trim box, in inches. Zero
   * means the artwork trims flush with no bleed. Undefined means the file
   * declares no trim box, so bleed cannot be judged.
   */
  bleedInches?: number;
  /** Colour space as reported by the decoder, e.g. "srgb" or "cmyk". */
  colorSpace?: string;
}

function round(value: number, digits = 2) {
  const power = 10 ** digits;
  return Math.round(value * power) / power;
}

/**
 * Sizes read the way a print shop writes them. Three decimals, trailing zeros
 * dropped, so a standard eighth-inch bleed prints as 0.125in rather than
 * rounding to an unfamiliar 0.13in.
 */
function inches(value: number) {
  return `${round(value, 3)}in`;
}

/** Proportion of the long edge to the short edge, orientation-independent. */
function aspect(width: number, height: number) {
  const small = Math.min(width, height);
  const large = Math.max(width, height);
  return small > 0 ? large / small : 0;
}

/**
 * Does the artwork's proportion match the requested finished size? This mirrors
 * the calculation the preflight route already performs; it is restated as a
 * finding so the whole picture reads as one list.
 */
function proportionFinding(m: ArtworkMeasurements): ArtworkFinding | undefined {
  const { requestedWidth, requestedHeight, artworkWidth, artworkHeight } = m;
  if (!requestedWidth || !requestedHeight || !artworkWidth || !artworkHeight) return undefined;

  const requested = aspect(requestedWidth, requestedHeight);
  const actual = aspect(artworkWidth, artworkHeight);
  if (!requested || !actual) return undefined;

  const difference = Math.abs(actual - requested) / requested * 100;
  if (difference <= 1.25) {
    return {
      id: "proportion",
      level: "ok",
      title: "Proportion matches the requested size",
      detail: `The artwork scales cleanly to ${inches(requestedWidth)} × ${inches(requestedHeight)}.`
    };
  }
  return {
    id: "proportion",
    level: "warning",
    title: "Proportion does not match the requested size",
    detail:
      `Asked for ${inches(requestedWidth)} × ${inches(requestedHeight)}, artwork measures ` +
      `${inches(artworkWidth)} × ${inches(artworkHeight)} — ${round(difference)}% out. ` +
      "Confirm which edge to hold before scaling."
  };
}

/**
 * A file whose pages are not all the same size. Common and usually innocent —
 * a cover plus an interior — but it changes how the job is imposed, so staff
 * should see it rather than discover it at the press.
 */
function pageSizeFinding(m: ArtworkMeasurements): ArtworkFinding | undefined {
  const pages = m.pageSizes;
  if (!pages || pages.length < 2) return undefined;

  const distinct = Array.from(
    new Set(pages.map((page) => `${round(page.width)}×${round(page.height)}`))
  );
  if (distinct.length === 1) {
    return {
      id: "page-sizes",
      level: "ok",
      title: "All pages are the same size",
      detail: `Consistent ${distinct[0]}in trim across ${pages.length} pages.`
    };
  }
  return {
    id: "page-sizes",
    level: "caution",
    title: "Pages are not all the same size",
    detail:
      `${distinct.length} different page sizes in one file (${distinct.join(", ")} in). ` +
      "Confirm which page is the piece being quoted."
  };
}

/** Portrait artwork for a landscape request, or the other way round. */
function orientationFinding(m: ArtworkMeasurements): ArtworkFinding | undefined {
  const { requestedWidth, requestedHeight, artworkWidth, artworkHeight } = m;
  if (!requestedWidth || !requestedHeight || !artworkWidth || !artworkHeight) return undefined;
  // A square piece has no orientation to disagree about.
  if (requestedWidth === requestedHeight || artworkWidth === artworkHeight) return undefined;

  const requestedLandscape = requestedWidth > requestedHeight;
  const artworkLandscape = artworkWidth > artworkHeight;
  if (requestedLandscape === artworkLandscape) {
    return {
      id: "orientation",
      level: "ok",
      title: "Orientation matches",
      detail: `${artworkLandscape ? "Landscape" : "Portrait"}, as requested.`
    };
  }
  return {
    id: "orientation",
    level: "caution",
    title: "Orientation is the other way round",
    detail:
      `The request is ${requestedLandscape ? "landscape" : "portrait"} but the artwork is ` +
      `${artworkLandscape ? "landscape" : "portrait"}. Confirm before rotating anything.`
  };
}

/**
 * Bleed, judged from the file's own trim box. A file with no trim box declares
 * no intent, so nothing is reported rather than assuming the worst.
 */
function bleedFinding(m: ArtworkMeasurements): ArtworkFinding | undefined {
  if (m.bleedInches === undefined) return undefined;

  if (m.bleedInches >= REQUIRED_BLEED_INCHES - 0.001) {
    return {
      id: "bleed",
      level: "ok",
      title: "Artwork carries bleed",
      detail: `${inches(m.bleedInches)} past the trim on every edge.`
    };
  }
  if (m.bleedInches <= 0.001) {
    return {
      id: "bleed",
      level: "caution",
      title: "No bleed on the artwork",
      detail:
        `The shop needs ${REQUIRED_BLEED_INCHES}in past the trim on every edge. This file trims ` +
        "flush, so ask for a version with bleed or plan to add a background."
    };
  }
  return {
    id: "bleed",
    level: "caution",
    title: "Not enough bleed",
    detail:
      `Only ${inches(m.bleedInches)} past the trim; the shop needs ${REQUIRED_BLEED_INCHES}in. ` +
      "A small shift on the cutter would show white on the edge."
  };
}

/**
 * Effective resolution at the size the piece will actually be printed.
 * Meaningful only for raster artwork: vector PDF content has no resolution to
 * measure, so nothing is reported for it.
 */
function resolutionFinding(m: ArtworkMeasurements): ArtworkFinding | undefined {
  const { pixelWidth, pixelHeight } = m;
  if (!pixelWidth || !pixelHeight) return undefined;

  // Judge against the finished size when it is known, since that is the size
  // the pixels have to cover. Otherwise fall back to the artwork's own size.
  const width = m.requestedWidth ?? m.artworkWidth;
  const height = m.requestedHeight ?? m.artworkHeight;
  if (!width || !height) return undefined;

  const effective = Math.min(pixelWidth / width, pixelHeight / height);
  if (!Number.isFinite(effective) || effective <= 0) return undefined;

  const longEdge = Math.max(width, height);
  const floor = longEdge <= CLOSE_VIEW_MAX_INCHES ? DPI_FLOOR_SMALL : DPI_FLOOR_LARGE;
  const viewing = longEdge <= CLOSE_VIEW_MAX_INCHES ? "held in the hand" : "viewed from a distance";

  if (effective >= floor) {
    return {
      id: "resolution",
      level: "ok",
      title: "Resolution is fine for this size",
      detail: `About ${Math.round(effective)} dpi at ${inches(width)} × ${inches(height)}, ${viewing}.`
    };
  }
  return {
    id: "resolution",
    level: effective < floor / 2 ? "warning" : "caution",
    title: "Effective resolution is low for this size",
    detail:
      `About ${Math.round(effective)} dpi at ${inches(width)} × ${inches(height)}, and the shop ` +
      `wants at least ${floor} dpi for work ${viewing}. Ask for a larger file before printing.`
  };
}

/** RGB artwork heading for a CMYK press will shift, especially in the golds. */
function colorSpaceFinding(m: ArtworkMeasurements): ArtworkFinding | undefined {
  const space = m.colorSpace?.toLowerCase();
  if (!space) return undefined;

  if (space === "cmyk") {
    return { id: "color-space", level: "ok", title: "Artwork is already CMYK", detail: "No conversion needed for the press." };
  }
  if (space === "b-w" || space === "grey" || space === "gray") {
    return { id: "color-space", level: "ok", title: "Artwork is greyscale", detail: "Prints as black only unless colour is requested." };
  }
  if (space.startsWith("srgb") || space === "rgb" || space === "rgb16") {
    return {
      id: "color-space",
      level: "caution",
      title: "Artwork is RGB, the press is CMYK",
      detail:
        "Colours shift slightly on conversion, and bright blues and greens shift most. " +
        "Send a proof before committing to the full run."
    };
  }
  return undefined;
}

const RULES: Array<(m: ArtworkMeasurements) => ArtworkFinding | undefined> = [
  proportionFinding,
  pageSizeFinding,
  orientationFinding,
  bleedFinding,
  resolutionFinding,
  colorSpaceFinding
];

const LEVEL_RANK: Record<ArtworkFindingLevel, number> = { warning: 0, caution: 1, ok: 2 };

/**
 * Run every rule against what was measured, worst news first so staff reads the
 * problems before the reassurances.
 */
export function buildArtworkFindings(measurements: ArtworkMeasurements): ArtworkFinding[] {
  return RULES
    .map((rule) => rule(measurements))
    .filter((finding): finding is ArtworkFinding => Boolean(finding))
    .sort((a, b) => LEVEL_RANK[a.level] - LEVEL_RANK[b.level]);
}

/** Count of findings staff still needs to look at, for a summary line. */
export function findingsNeedingAttention(findings: ArtworkFinding[] = []) {
  return findings.filter((finding) => finding.level !== "ok").length;
}
