import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { PDFDocument, PDFName, type PDFPage } from "pdf-lib";
import { buildArtworkFindings, type ArtworkMeasurements } from "@/lib/artwork-preflight";
import {
  emailServerConfigured,
  errorResponse,
  loadMailboxAttachment,
  requireActiveAppUser
} from "@/lib/gmail-server";
import type { ArtworkPreflightResult } from "@/lib/types";
import { rejectCrossSiteMutation, rejectOversizedJson } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Input = {
  messageId?: string;
  attachmentId?: string;
  folder?: "inbox" | "sent";
  uidValidity?: string;
  filename?: string;
  mimeType?: string;
  requestedWidth?: number;
  requestedHeight?: number;
};

function positive(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : undefined;
}

function rounded(value: number, digits = 3) {
  const power = 10 ** digits;
  return Math.round(value * power) / power;
}

function normalizedRatio(width: number, height: number) {
  const small = Math.min(width, height);
  const large = Math.max(width, height);
  return small > 0 ? large / small : 0;
}

function mismatchPercent(requestedWidth: number, requestedHeight: number, artworkWidth: number, artworkHeight: number) {
  const requestedRatio = normalizedRatio(requestedWidth, requestedHeight);
  const artworkRatio = normalizedRatio(artworkWidth, artworkHeight);
  if (!requestedRatio || !artworkRatio) return undefined;
  return Math.abs(artworkRatio - requestedRatio) / requestedRatio * 100;
}

function proportionalOptions(requestedWidth: number, requestedHeight: number, artworkWidth: number, artworkHeight: number) {
  const requestedLandscape = requestedWidth >= requestedHeight;
  const artworkLandscape = artworkWidth >= artworkHeight;
  const rotationSuggested = requestedLandscape !== artworkLandscape;
  const ratio = rotationSuggested ? artworkHeight / artworkWidth : artworkWidth / artworkHeight;
  if (!Number.isFinite(ratio) || ratio <= 0) return { rotationSuggested };
  return {
    rotationSuggested,
    proportionalWidthOption: {
      width: rounded(requestedWidth),
      height: rounded(requestedWidth / ratio)
    },
    proportionalHeightOption: {
      width: rounded(requestedHeight * ratio),
      height: rounded(requestedHeight)
    }
  };
}

/** PDF user space is 72 units to the inch. */
const POINTS_PER_INCH = 72;

/**
 * Smallest inset between the media box and the declared trim box, in inches —
 * the bleed the designer actually built in.
 *
 * `page.getTrimBox()` silently returns the media box when a page declares no
 * TrimBox, which would make every flush file look deliberately trimmed. The raw
 * dictionary is checked first so a file that states no trim intent reports no
 * bleed measurement at all, rather than a misleading zero.
 */
function measureBleed(page: PDFPage): number | undefined {
  if (!page.node.get(PDFName.of("TrimBox"))) return undefined;

  const media = page.getMediaBox();
  const trim = page.getTrimBox();
  const left = trim.x - media.x;
  const bottom = trim.y - media.y;
  const right = (media.x + media.width) - (trim.x + trim.width);
  const top = (media.y + media.height) - (trim.y + trim.height);

  const smallest = Math.min(left, right, top, bottom);
  if (!Number.isFinite(smallest)) return undefined;
  // A negative inset means the trim box sits outside the media box, which is a
  // malformed file rather than a bleed measurement.
  return smallest < 0 ? 0 : smallest / POINTS_PER_INCH;
}

function resultBase(input: Input): Pick<ArtworkPreflightResult, "attachmentId" | "filename" | "mimeType" | "requestedWidth" | "requestedHeight"> {
  return {
    attachmentId: input.attachmentId ?? "",
    filename: input.filename?.trim() || "Artwork",
    mimeType: input.mimeType?.trim() || "application/octet-stream",
    requestedWidth: positive(input.requestedWidth),
    requestedHeight: positive(input.requestedHeight)
  };
}

function evaluate(input: Input, dimensions: {
  width: number;
  height: number;
  widthPixels?: number;
  heightPixels?: number;
  dpi?: number;
  pageCount?: number;
  pageSizes?: Array<{ width: number; height: number }>;
  bleedInches?: number;
  colorSpace?: string;
}): ArtworkPreflightResult {
  const requestedWidth = positive(input.requestedWidth);
  const requestedHeight = positive(input.requestedHeight);
  const base = resultBase(input);

  /**
   * Printability advice, carried alongside the size verdict. These never feed
   * into `severity`, so a bleed or colour warning cannot block a ticket that
   * would otherwise convert.
   */
  const measurements: ArtworkMeasurements = {
    requestedWidth,
    requestedHeight,
    artworkWidth: dimensions.width,
    artworkHeight: dimensions.height,
    pixelWidth: dimensions.widthPixels,
    pixelHeight: dimensions.heightPixels,
    pageSizes: dimensions.pageSizes,
    bleedInches: dimensions.bleedInches,
    colorSpace: dimensions.colorSpace
  };
  const extra = {
    findings: buildArtworkFindings(measurements),
    pageSizes: dimensions.pageSizes,
    bleedInches: dimensions.bleedInches,
    colorSpace: dimensions.colorSpace
  };
  const mismatch = requestedWidth && requestedHeight
    ? mismatchPercent(requestedWidth, requestedHeight, dimensions.width, dimensions.height)
    : undefined;
  const options = requestedWidth && requestedHeight
    ? proportionalOptions(requestedWidth, requestedHeight, dimensions.width, dimensions.height)
    : {};

  if (!requestedWidth || !requestedHeight) {
    return {
      ...base,
      ...options,
      artworkWidth: rounded(dimensions.width),
      artworkHeight: rounded(dimensions.height),
      artworkWidthPixels: dimensions.widthPixels,
      artworkHeightPixels: dimensions.heightPixels,
      dpi: dimensions.dpi,
      pageCount: dimensions.pageCount,
      ...extra,
      severity: "minor",
      message: "Artwork was measured, but the requested finished size is not confirmed yet.",
      questions: ["What finished width and height should this artwork be produced at?"]
    };
  }

  const difference = mismatch ?? 100;
  const exactPhysical = dimensions.dpi && Math.abs(dimensions.width - requestedWidth) <= 0.13 && Math.abs(dimensions.height - requestedHeight) <= 0.13;
  const physicalRotated = dimensions.dpi && Math.abs(dimensions.height - requestedWidth) <= 0.13 && Math.abs(dimensions.width - requestedHeight) <= 0.13;
  if (difference <= 1.25) {
    return {
      ...base,
      ...options,
      artworkWidth: rounded(dimensions.width),
      artworkHeight: rounded(dimensions.height),
      artworkWidthPixels: dimensions.widthPixels,
      artworkHeightPixels: dimensions.heightPixels,
      dpi: dimensions.dpi,
      pageCount: dimensions.pageCount,
      aspectMismatchPercent: rounded(difference, 2),
      ...extra,
      severity: "ok",
      message: exactPhysical || physicalRotated
        ? "Artwork size and proportion match the requested finished size."
        : "Artwork proportion matches the requested size and can be scaled proportionally.",
      questions: []
    };
  }
  if (difference <= 3) {
    return {
      ...base,
      ...options,
      artworkWidth: rounded(dimensions.width),
      artworkHeight: rounded(dimensions.height),
      artworkWidthPixels: dimensions.widthPixels,
      artworkHeightPixels: dimensions.heightPixels,
      dpi: dimensions.dpi,
      pageCount: dimensions.pageCount,
      aspectMismatchPercent: rounded(difference, 2),
      ...extra,
      severity: "minor",
      message: "Artwork proportion is slightly different from the requested finished size. Staff should confirm how to handle the small difference.",
      questions: ["Should we crop slightly, fit the complete artwork, or use the closest proportional finished size?"]
    };
  }
  return {
    ...base,
    ...options,
    artworkWidth: rounded(dimensions.width),
    artworkHeight: rounded(dimensions.height),
    artworkWidthPixels: dimensions.widthPixels,
    artworkHeightPixels: dimensions.heightPixels,
    dpi: dimensions.dpi,
    pageCount: dimensions.pageCount,
    aspectMismatchPercent: rounded(difference, 2),
    ...extra,
    severity: "warning",
    message: "Artwork proportion does not match the requested finished size. Cropping, extra space, or a different finished size will be needed.",
    questions: ["The artwork proportion does not match the requested size. Should we crop to fill, fit the complete artwork with extra space, or use the closest proportional size?"]
  };
}

export async function POST(request: NextRequest) {
  const crossSite = rejectCrossSiteMutation(request);
  if (crossSite) return crossSite;
  const oversized = rejectOversizedJson(request, 64 * 1024);
  if (oversized) return oversized;
  const auth = await requireActiveAppUser(request, ["admin", "front_desk", "prepress"]);
  if (auth instanceof NextResponse) return auth;
  if (!emailServerConfigured()) return errorResponse("The Gross Printing mailbox is not configured on the server.", 503);

  let body: Input;
  try {
    body = (await request.json()) as Input;
  } catch {
    return errorResponse("Invalid artwork preflight request.");
  }
  if (!body.messageId || !body.attachmentId) return errorResponse("Message and attachment identifiers are required.");
  if (!body.uidValidity || !/^\d+$/.test(body.uidValidity)) return errorResponse("Refresh Email Center before checking this artwork.", 409);

  try {
    const attachment = await loadMailboxAttachment(
      body.messageId,
      body.attachmentId,
      body.folder === "sent" ? "sent" : "inbox",
      body.uidValidity
    );
    const bytes = attachment.bytes;
    body = { ...body, filename: attachment.filename, mimeType: attachment.mimeType };
    const mime = attachment.mimeType.toLowerCase();
    const filename = attachment.filename.toLowerCase();

    if (mime === "application/pdf" || filename.endsWith(".pdf")) {
      const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
      const pages = pdf.getPages();
      const first = pages[0];
      if (!first) throw new Error("The PDF does not contain a printable page.");
      // Measure every page, not just the first: a cover at one size and an
      // interior at another changes how the job is imposed.
      const pageSizes = pages.map((page) => ({
        width: rounded(page.getWidth() / POINTS_PER_INCH),
        height: rounded(page.getHeight() / POINTS_PER_INCH)
      }));
      const result = evaluate(body, {
        width: first.getWidth() / POINTS_PER_INCH,
        height: first.getHeight() / POINTS_PER_INCH,
        pageCount: pages.length,
        pageSizes,
        bleedInches: measureBleed(first)
        // Colour space is deliberately not reported for PDFs. It varies per
        // object inside the file, so a single value would be a guess.
      });
      return NextResponse.json({ ok: true, result });
    }

    if (mime.startsWith("image/") || /\.(png|jpe?g|tiff?|webp|gif)$/i.test(filename)) {
      const metadata = await sharp(bytes, { animated: false }).metadata();
      if (!metadata.width || !metadata.height) throw new Error("The image dimensions could not be read.");
      const dpi = positive(metadata.density);
      const physicalWidth = dpi ? metadata.width / dpi : metadata.width;
      const physicalHeight = dpi ? metadata.height / dpi : metadata.height;
      const result = evaluate(body, {
        width: physicalWidth,
        height: physicalHeight,
        widthPixels: metadata.width,
        heightPixels: metadata.height,
        dpi,
        // A raster file has one colour space for the whole image, so unlike a
        // PDF this can be reported without guessing.
        colorSpace: metadata.space
      });
      if (!dpi) {
        result.artworkWidth = undefined;
        result.artworkHeight = undefined;
        result.message = result.severity === "warning"
          ? "The image proportion does not match the requested finished size. The file has no reliable DPI, so physical size cannot be confirmed."
          : "The image proportion was checked. The file has no reliable DPI, so physical size cannot be confirmed.";
      }
      return NextResponse.json({ ok: true, result });
    }

    const result: ArtworkPreflightResult = {
      ...resultBase(body),
      severity: "unsupported",
      message: "This file type cannot be measured automatically. Staff should inspect it before production.",
      questions: []
    };
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Unable to inspect artwork.", 502);
  }
}
