/**
 * Customer-facing wording for an artwork that does not match the finished size
 * the customer asked for.
 *
 * The preflight route already works out the two proportional ways to resolve a
 * mismatch, but the previous draft threw them away and asked the customer a
 * vague "please confirm the finished size". That puts the work back on the
 * customer. When someone asks for a 3 ft × 4 ft sign and sends a file with a
 * different proportion, the useful question names both concrete outcomes and
 * asks which edge matters: hold the 4 ft width, or hold the 3 ft height.
 */

import type { ArtworkPreflightResult } from "./types";
import { formatSize, fromInches, trimNumber, type SizeUnit } from "./requested-size";

export interface ArtworkReplyOptions {
  /** Unit the customer used, so the reply speaks in their terms. */
  unit?: SizeUnit;
  /** Contact first name, when the ticket knows it. */
  customerName?: string;
  /** Staff member signing the reply. */
  staffName?: string;
}

export interface SizeChoice {
  /** Which edge of the requested size this choice holds exactly. */
  hold: "width" | "height";
  widthInches: number;
  heightInches: number;
  /** Human label, e.g. "Keep the full 4 ft width". */
  label: string;
  /** Resulting finished size in the customer's unit, e.g. "4 ft × 5.33 ft". */
  resultLabel: string;
}

function inUnit(inches: number, unit: SizeUnit) {
  return unit === "in" ? inches : fromInches(inches, unit);
}

function sizeLabel(widthInches: number, heightInches: number, unit: SizeUnit) {
  return formatSize(inUnit(widthInches, unit), inUnit(heightInches, unit), unit);
}

function edgeLabel(value: number, unit: SizeUnit) {
  const suffix: Record<SizeUnit, string> = { in: '"', ft: " ft", mm: " mm", cm: " cm", m: " m" };
  return `${trimNumber(inUnit(value, unit))}${suffix[unit]}`;
}

/**
 * The two proportional resolutions for a mismatch, in the customer's unit.
 * Returns an empty list when preflight could not measure the artwork or the
 * requested size is unknown, because there is then nothing concrete to offer.
 */
export function sizeChoices(result: ArtworkPreflightResult, unit: SizeUnit = "in"): SizeChoice[] {
  const { requestedWidth, requestedHeight, proportionalWidthOption, proportionalHeightOption } = result;
  if (!requestedWidth || !requestedHeight) return [];

  const choices: SizeChoice[] = [];

  if (proportionalWidthOption) {
    choices.push({
      hold: "width",
      widthInches: proportionalWidthOption.width,
      heightInches: proportionalWidthOption.height,
      label: `Keep the full ${edgeLabel(requestedWidth, unit)} width`,
      resultLabel: sizeLabel(proportionalWidthOption.width, proportionalWidthOption.height, unit)
    });
  }

  if (proportionalHeightOption) {
    choices.push({
      hold: "height",
      widthInches: proportionalHeightOption.width,
      heightInches: proportionalHeightOption.height,
      label: `Keep the full ${edgeLabel(requestedHeight, unit)} height`,
      resultLabel: sizeLabel(proportionalHeightOption.width, proportionalHeightOption.height, unit)
    });
  }

  return choices;
}

function measuredLabel(result: ArtworkPreflightResult, unit: SizeUnit) {
  if (result.artworkWidth && result.artworkHeight) {
    return sizeLabel(result.artworkWidth, result.artworkHeight, unit);
  }
  if (result.artworkWidthPixels && result.artworkHeightPixels) {
    return `${result.artworkWidthPixels} × ${result.artworkHeightPixels} pixels`;
  }
  return "a different proportion";
}

/**
 * A ready-to-send reply asking the customer which edge to hold.
 *
 * Deliberately plain: it states what was received, what was measured, the two
 * outcomes, and one question. It never proposes cropping on its own, because
 * trimming a customer's artwork without approval is the expensive mistake.
 */
export function artworkMismatchReply(result: ArtworkPreflightResult, options: ArtworkReplyOptions = {}) {
  const greeting = options.customerName ? `Hi ${options.customerName},` : "Hi,";
  const closing = options.staffName ? `Thanks,\n${options.staffName}\nGross Printing` : "Thanks,\nGross Printing";
  return [greeting, "", artworkMismatchBody(result, options), "", closing].join("\n");
}

/**
 * The mismatch explanation on its own, with no greeting or signature, so it can
 * be appended to a reply draft that already asks the customer other questions.
 */
export function artworkMismatchBody(result: ArtworkPreflightResult, options: ArtworkReplyOptions = {}) {
  const unit = options.unit ?? "in";
  const choices = sizeChoices(result, unit);

  const requested = result.requestedWidth && result.requestedHeight
    ? sizeLabel(result.requestedWidth, result.requestedHeight, unit)
    : undefined;
  const measured = measuredLabel(result, unit);

  const lines: string[] = [];

  if (requested) {
    lines.push(
      `Thanks for sending ${result.filename}. You asked for a finished size of ${requested}, ` +
      `but the artwork measures ${measured}, so it is not the same proportion. ` +
      `If we scale it to one of those dimensions, the other one will not land exactly on your number.`
    );
  } else {
    lines.push(
      `Thanks for sending ${result.filename}. The artwork measures ${measured}. ` +
      `Before we print, please confirm the finished size you need.`
    );
  }

  if (choices.length === 2) {
    lines.push("", "There are two ways to handle it, both keeping your artwork undistorted:", "");
    choices.forEach((choice, index) => {
      lines.push(`${index + 1}. ${choice.label} — the finished piece would be ${choice.resultLabel}.`);
    });
    lines.push(
      "",
      "Which one would you like? If neither works, we can also add background to fill the exact " +
      "size you asked for, or crop the artwork — just let us know and we will send a proof first."
    );
  } else if (requested) {
    lines.push("", `Please confirm whether we should hold the finished size at ${requested} or match the artwork as supplied.`);
  }

  if (result.rotationSuggested) {
    lines.push(
      "",
      "One more thing: the artwork is oriented the opposite way from the size you requested " +
      "(one is portrait and the other is landscape). Please confirm which orientation you want."
    );
  }

  lines.push("", "We will not resize, crop, or rotate anything until you confirm.");

  return lines.join("\n");
}

/** Short one-line summary of the mismatch, for the ticket list and job notes. */
export function artworkMismatchSummary(result: ArtworkPreflightResult, unit: SizeUnit = "in") {
  const requested = result.requestedWidth && result.requestedHeight
    ? sizeLabel(result.requestedWidth, result.requestedHeight, unit)
    : "the requested size";
  return `${result.filename}: asked for ${requested}, artwork measures ${measuredLabel(result, unit)}.`;
}
