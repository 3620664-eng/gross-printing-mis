"use client";

import { Download, Expand, FileUp, Maximize2, Minimize2, Printer, Save, ZoomIn, ZoomOut } from "lucide-react";
import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { calculateImposition, formatMoney, MANUAL_UP_PRESETS } from "@/lib/pricing";
import { createImposedPdf } from "@/lib/imposition-pdf";
import type { BleedType, FitMode, ImpositionMode, ImpositionSettings, PaperStock, RotationMode, UpPreset } from "@/lib/types";

export interface ArtworkPage {
  pageNumber: number;
  previewDataUrl: string;
  widthInches: number;
  heightInches: number;
  detectedBleed?: number;
  trimWidthInches?: number;
  trimHeightInches?: number;
}

export interface ArtworkUpload {
  file?: File;
  name?: string;
  previewDataUrl?: string;
  widthInches?: number;
  heightInches?: number;
  pages?: ArtworkPage[];
  selectedPageIndex?: number;
  pageCount?: number;
}

function fitCanvasRect(
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
  mode: FitMode
) {
  if (mode === "stretch") {
    return { x: 0, y: 0, width: targetWidth, height: targetHeight };
  }

  const scale =
    mode === "cover"
      ? Math.max(targetWidth / sourceWidth, targetHeight / sourceHeight)
      : Math.min(targetWidth / sourceWidth, targetHeight / sourceHeight);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  return {
    x: (targetWidth - width) / 2,
    y: (targetHeight - height) / 2,
    width,
    height
  };
}

function loadPreviewImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function normalizeRotation(rotation: number | undefined) {
  return (((rotation ?? 0) % 360) + 360) % 360;
}

function isQuarterTurn(rotation: number | undefined) {
  const normalized = normalizeRotation(rotation);
  return normalized === 90 || normalized === 270;
}

async function readImagePreview(file: File) {
  return new Promise<{ previewDataUrl: string; widthInches: number; heightInches: number; pages: ArtworkPage[]; pageCount: number; selectedPageIndex: number }>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const image = new window.Image();
      image.onload = () => {
        const maxPreviewPixels = 720;
        const scale = Math.min(1, maxPreviewPixels / Math.max(image.naturalWidth, image.naturalHeight));
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        if (!context) {
          reject(new Error("Could not render image preview."));
          return;
        }
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const page = {
          pageNumber: 1,
          previewDataUrl: canvas.toDataURL("image/jpeg", 0.78),
          widthInches: Number((image.naturalWidth / 300).toFixed(3)),
          heightInches: Number((image.naturalHeight / 300).toFixed(3))
        };
        resolve({
          previewDataUrl: page.previewDataUrl,
          widthInches: page.widthInches,
          heightInches: page.heightInches,
          pages: [page],
          pageCount: 1,
          selectedPageIndex: 0
        });
      };
      image.onerror = reject;
      image.src = String(reader.result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function roundToSixteenth(value: number) {
  return Number((Math.max(0, Math.round(value * 16) / 16)).toFixed(4));
}

function detectLikelyUploadedMarks(page: ArtworkPage, pieceWidth: number, pieceHeight: number) {
  const orientations = [
    { width: pieceWidth, height: pieceHeight },
    { width: pieceHeight, height: pieceWidth }
  ];

  for (const target of orientations) {
    const extraWidth = page.widthInches - target.width;
    const extraHeight = page.heightInches - target.height;
    if (extraWidth < 0.12 || extraHeight < 0.12) continue;

    const cropX = extraWidth / 2;
    const cropY = extraHeight / 2;
    if (Math.abs(cropX - cropY) <= 0.05 && cropX <= 0.5 && cropY <= 0.5) {
      return roundToSixteenth(Math.min(cropX, cropY));
    }
  }

  return 0;
}

function pointsToInches(value: number) {
  return Number((value / 72).toFixed(3));
}

function formatInches(value?: number) {
  return typeof value === "number" ? Number(value.toFixed(3)).toString() : "";
}

function safePreviewCount(value: number, fallback = 1) {
  return Number.isFinite(value) && value > 0 ? Math.min(600, Math.floor(value)) : fallback;
}

function bleedFromBoxes(
  bleedBox?: { x: number; y: number; width: number; height: number },
  trimBox?: { x: number; y: number; width: number; height: number }
) {
  if (!bleedBox || !trimBox) return 0;
  const sides = [
    trimBox.x - bleedBox.x,
    trimBox.y - bleedBox.y,
    bleedBox.x + bleedBox.width - (trimBox.x + trimBox.width),
    bleedBox.y + bleedBox.height - (trimBox.y + trimBox.height)
  ].filter((value) => value > 0.5);

  return sides.length ? pointsToInches(Math.min(...sides)) : 0;
}

async function readPdfPageBoxes(bytes: ArrayBuffer) {
  try {
    const { PDFDocument } = await import("pdf-lib");
    const pdf = await PDFDocument.load(bytes.slice(0));
    return pdf.getPages().map((page) => {
      const mediaBox = page.getMediaBox();
      const trimBox = page.getTrimBox?.() ?? page.getCropBox?.() ?? mediaBox;
      const bleedBox = page.getBleedBox?.() ?? trimBox;
      const detectedBleed = bleedFromBoxes(bleedBox, trimBox);
      return {
        detectedBleed,
        trimWidthInches: pointsToInches(trimBox.width),
        trimHeightInches: pointsToInches(trimBox.height)
      };
    });
  } catch {
    return [];
  }
}

function presetLabel(preset: UpPreset) {
  if (preset === "auto") return "Auto Best Fit";
  if (preset === "custom") return "Custom rows/columns";
  return preset;
}

export async function renderArtworkPreview(file: File, options: { firstPageOnly?: boolean } = {}) {
  if (file.type.startsWith("image/") || /\.(png|jpe?g)$/i.test(file.name)) {
    return readImagePreview(file);
  }

  const pdfjs = await import("pdfjs-dist");
  const basePath = (process.env.NEXT_PUBLIC_BASE_PATH || "").replace(/\/$/, "");
  pdfjs.GlobalWorkerOptions.workerSrc = `${basePath}/pdf.worker.min.mjs`;
  const bytes = await file.arrayBuffer();
  const pdfBoxes = await readPdfPageBoxes(bytes.slice(0));
  const pdf = await pdfjs.getDocument({ data: bytes.slice(0) }).promise;
  const pages: ArtworkPage[] = [];
  const previewPageCount = options.firstPageOnly ? Math.min(1, pdf.numPages) : pdf.numPages;
  for (let pageNumber = 1; pageNumber <= previewPageCount; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const boxInfo = pdfBoxes[pageNumber - 1];
    const naturalViewport = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: Math.min(1, Math.max(0.45, 560 / naturalViewport.width)) });
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not render PDF preview.");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, canvasContext: context, viewport }).promise;
    pages.push({
      pageNumber,
      previewDataUrl: canvas.toDataURL("image/jpeg", 0.78),
      widthInches: Number((naturalViewport.width / 72).toFixed(3)),
      heightInches: Number((naturalViewport.height / 72).toFixed(3)),
      detectedBleed: boxInfo?.detectedBleed ?? 0,
      trimWidthInches: boxInfo?.trimWidthInches,
      trimHeightInches: boxInfo?.trimHeightInches
    });
  }
  const firstPage = pages[0];
  return {
    previewDataUrl: firstPage.previewDataUrl,
    widthInches: firstPage.widthInches,
    heightInches: firstPage.heightInches,
    pages,
    pageCount: pdf.numPages,
    selectedPageIndex: 0
  };
}

interface ImpositionStudioProps {
  stock: PaperStock;
  quantity: number;
  pieceWidth: number;
  pieceHeight: number;
  settings: ImpositionSettings;
  onSettingsChange: (settings: ImpositionSettings) => void;
  artwork: ArtworkUpload;
  onArtworkChange: (artwork: ArtworkUpload) => void;
  onUseArtworkSize: (width: number, height: number) => void;
  onUseSheetSize: (width: number, height: number) => void;
  downloadFileBaseName?: string;
  variant?: "full" | "upload" | "production";
}

function safeProductionFileBaseName(value: string) {
  const cleaned = value
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/g, "")
    .trim();
  return (cleaned || "production-file").slice(0, 140);
}

export function ImpositionStudio({
  stock,
  quantity,
  pieceWidth,
  pieceHeight,
  settings,
  onSettingsChange,
  artwork,
  onArtworkChange,
  onUseArtworkSize,
  onUseSheetSize,
  downloadFileBaseName,
  variant = "full"
}: ImpositionStudioProps) {
  const DUPLICATION_EDGE_SAMPLE_INCHES = 0.03;
  const inputRef = useRef<HTMLInputElement>(null);
  const [rendering, setRendering] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [bookletSideIndex, setBookletSideIndex] = useState(0);
  const result = useMemo(
    () => calculateImposition(stock, quantity, pieceWidth, pieceHeight, settings),
    [stock, quantity, pieceWidth, pieceHeight, settings]
  );
  const savedRotationMode = settings.rotationMode ?? (settings.rotate ? "90" : "0");
  const rotationMode: RotationMode = savedRotationMode === "auto" || savedRotationMode === "360" ? "0" : savedRotationMode;
  const appliedArtworkRotation = normalizeRotation(result.artworkRotation ?? (result.artworkRotated ? 90 : 0));
  const quarterTurnArtwork = isQuarterTurn(appliedArtworkRotation);
  const selectedPageIndex = artwork.selectedPageIndex ?? 0;
  const sourcePageCount = artwork.pageCount ?? artwork.pages?.length ?? 0;
  const bookletPaddedPageCount = sourcePageCount > 0 ? Math.max(4, Math.ceil(sourcePageCount / 4) * 4) : 4;
  const bookletSignatureCount = Math.max(1, bookletPaddedPageCount / 4);
  const bookletPressSideCount = bookletSignatureCount * 2;
  const bookletCopiesPerParent = Math.max(1, Math.floor(result.columns / 2) * result.rows);
  const bookletBlankPages = Math.max(0, bookletPaddedPageCount - sourcePageCount);
  const bookletReadingDirection = settings.bookletReadingDirection ?? "ltr";
  const activePage = artwork.pages?.[selectedPageIndex];
  const activeArtworkWidth = activePage?.widthInches ?? artwork.widthInches;
  const activeArtworkHeight = activePage?.heightInches ?? artwork.heightInches;
  const activeDetectedBleed = activePage?.detectedBleed ?? 0;
  const trimmedArtworkWidth =
    activeArtworkWidth && settings.artworkBoxMode === "trim-marks"
      ? Math.max(0.1, activeArtworkWidth - settings.artworkCrop * 2)
      : activeArtworkWidth;
  const trimmedArtworkHeight =
    activeArtworkHeight && settings.artworkBoxMode === "trim-marks"
      ? Math.max(0.1, activeArtworkHeight - settings.artworkCrop * 2)
      : activeArtworkHeight;
  const displayedArtworkWidth =
    trimmedArtworkWidth && trimmedArtworkHeight
      ? quarterTurnArtwork
        ? trimmedArtworkHeight
        : trimmedArtworkWidth
      : undefined;
  const displayedArtworkHeight =
    trimmedArtworkWidth && trimmedArtworkHeight
      ? quarterTurnArtwork
        ? trimmedArtworkWidth
        : trimmedArtworkHeight
      : undefined;
  const activeOrientation =
    activeArtworkWidth && activeArtworkHeight
      ? activeArtworkWidth >= activeArtworkHeight
        ? "Landscape"
        : "Portrait"
      : "No file";
  const bleedReadout =
    activeDetectedBleed > 0
      ? `${activeDetectedBleed.toFixed(3)} in PDF bleed detected`
      : settings.artworkBoxMode === "trim-marks" && settings.artworkCrop > 0
      ? `${settings.artworkCrop.toFixed(3)} in detected/manual trim`
      : `${settings.bleed.toFixed(3)} in manual bleed`;
  const warnings = useMemo(() => {
    const nextWarnings: string[] = [];
    if (!artwork.file) {
      nextWarnings.push("Upload artwork before creating the imposed PDF.");
    }
    if (settings.mode === "booklet" && result.columns < 2) {
      nextWarnings.push("This parent sheet is too small for a two-page booklet spread. Choose a larger parent sheet or rotate the sheet.");
    }
    if (displayedArtworkWidth && displayedArtworkHeight) {
      const artworkRatio = displayedArtworkWidth / displayedArtworkHeight;
      const pieceRatio = pieceWidth / pieceHeight;
      if (Math.abs(artworkRatio - pieceRatio) > 0.18 && settings.fitMode === "contain") {
        nextWarnings.push("Artwork ratio does not match the finished size; Fit whole will leave white space.");
      }
      if (settings.artworkBoxMode === "full-page" && (displayedArtworkWidth > pieceWidth + 0.2 || displayedArtworkHeight > pieceHeight + 0.2)) {
        nextWarnings.push("Uploaded page is larger than finished size; use Trim marks/bleed if the file includes printer marks.");
      }
    }
    return nextWarnings;
  }, [artwork.file, displayedArtworkWidth, displayedArtworkHeight, pieceWidth, pieceHeight, result.columns, settings.mode, settings.fitMode, settings.artworkBoxMode]);
  const rotationStatus = appliedArtworkRotation ? `Artwork rotated ${appliedArtworkRotation} degrees` : "Artwork upright";
  const previewObjectFit: CSSProperties["objectFit"] = settings.fitMode === "stretch" ? "fill" : settings.fitMode;
  const sheetRatio = result.sheetWidth / result.sheetHeight;
  const basePreviewWidth = sheetRatio < 0.78 ? 520 : sheetRatio > 1.35 ? 760 : 640;
  const previewWidth = Math.round(basePreviewWidth * zoom);
  const activeBleed = settings.imageBleedEnabled ? settings.bleed : 0;
  const [duplicationPreviews, setDuplicationPreviews] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function renderDuplicationSources() {
      if (settings.bleedType !== "duplication" || !artwork.pages?.length) {
        setDuplicationPreviews([]);
        return;
      }

      const pieceRatio = result.pieceWidth / Math.max(0.001, result.pieceHeight);
      const longSide = 720;
      const canvasWidth = Math.round(pieceRatio >= 1 ? longSide : Math.max(120, longSide * pieceRatio));
      const canvasHeight = Math.round(pieceRatio >= 1 ? Math.max(120, longSide / pieceRatio) : longSide);

      const renderedPages = await Promise.all(
        artwork.pages.map(async (page) => {
          const image = await loadPreviewImage(page.previewDataUrl);
          const canvas = document.createElement("canvas");
          canvas.width = canvasWidth;
          canvas.height = canvasHeight;
          const context = canvas.getContext("2d");
          if (!context) return page.previewDataUrl;

          context.imageSmoothingEnabled = true;
          context.imageSmoothingQuality = "high";
          context.fillStyle = "#ffffff";
          context.fillRect(0, 0, canvas.width, canvas.height);

          const cropX =
            settings.artworkBoxMode === "trim-marks" && page.widthInches
              ? Math.min(image.naturalWidth / 2 - 1, settings.artworkCrop * (image.naturalWidth / page.widthInches))
              : 0;
          const cropY =
            settings.artworkBoxMode === "trim-marks" && page.heightInches
              ? Math.min(image.naturalHeight / 2 - 1, settings.artworkCrop * (image.naturalHeight / page.heightInches))
              : 0;
          const sourceX = Math.max(0, cropX);
          const sourceY = Math.max(0, cropY);
          const sourceWidth = Math.max(1, image.naturalWidth - sourceX * 2);
          const sourceHeight = Math.max(1, image.naturalHeight - sourceY * 2);
          const normalizedRotation = normalizeRotation(appliedArtworkRotation);
          const quarterTurn = isQuarterTurn(normalizedRotation);
          const layoutSourceWidth = quarterTurn ? sourceHeight : sourceWidth;
          const layoutSourceHeight = quarterTurn ? sourceWidth : sourceHeight;
          const fitted = fitCanvasRect(layoutSourceWidth, layoutSourceHeight, canvas.width, canvas.height, settings.fitMode);

          context.save();
          if (normalizedRotation === 90) {
            context.translate(fitted.x + fitted.width, fitted.y);
            context.rotate(Math.PI / 2);
            context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, fitted.height, fitted.width);
          } else if (normalizedRotation === 180) {
            context.translate(fitted.x + fitted.width, fitted.y + fitted.height);
            context.rotate(Math.PI);
            context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, fitted.width, fitted.height);
          } else if (normalizedRotation === 270) {
            context.translate(fitted.x, fitted.y + fitted.height);
            context.rotate((Math.PI * 3) / 2);
            context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, fitted.height, fitted.width);
          } else {
            context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, fitted.x, fitted.y, fitted.width, fitted.height);
          }
          context.restore();

          return canvas.toDataURL("image/png");
        })
      );

      if (!cancelled) {
        setDuplicationPreviews(renderedPages);
      }
    }

    renderDuplicationSources().catch(() => {
      if (!cancelled) setDuplicationPreviews([]);
    });

    return () => {
      cancelled = true;
    };
  }, [
    artwork.pages,
    appliedArtworkRotation,
    result.pieceHeight,
    result.pieceWidth,
    settings.artworkBoxMode,
    settings.artworkCrop,
    settings.bleedType,
    settings.fitMode
  ]);

  const pieces = useMemo(() => {
    const insideBleed = Math.max(0, Math.min(activeBleed, settings.gutter / 2));
    const pieceCount = safePreviewCount(result.piecesPerSheet);
    const columnCount = safePreviewCount(result.columns);
    const rowCount = safePreviewCount(result.rows);
    return Array.from({ length: pieceCount }, (_, index) => {
      const row = Math.floor(index / columnCount);
      const column = index % columnCount;
      const x = result.layoutLeft + column * (result.pieceWidth + settings.gutter);
      const y = result.layoutTop + row * (result.pieceHeight + settings.gutter);
      const leftBleed = column === 0 ? activeBleed : insideBleed;
      const rightBleed = column === columnCount - 1 ? activeBleed : insideBleed;
      const topBleed = row === 0 ? activeBleed : insideBleed;
      const bottomBleed = row === rowCount - 1 ? activeBleed : insideBleed;
      const bleedX = Math.max(0, x - leftBleed);
      const bleedY = Math.max(0, y - topBleed);
      const bleedRight = Math.min(result.sheetWidth, x + result.pieceWidth + rightBleed);
      const bleedBottom = Math.min(result.sheetHeight, y + result.pieceHeight + bottomBleed);
      return {
        id: `${row}-${column}`,
        left: (x / result.sheetWidth) * 100,
        top: (y / result.sheetHeight) * 100,
        width: (result.pieceWidth / result.sheetWidth) * 100,
        height: (result.pieceHeight / result.sheetHeight) * 100,
        bleedLeft: (bleedX / result.sheetWidth) * 100,
        bleedTop: (bleedY / result.sheetHeight) * 100,
        bleedWidth: ((bleedRight - bleedX) / result.sheetWidth) * 100,
        bleedHeight: ((bleedBottom - bleedY) / result.sheetHeight) * 100,
        trimLeftInBleed: ((x - bleedX) / Math.max(0.001, bleedRight - bleedX)) * 100,
        trimTopInBleed: ((y - bleedY) / Math.max(0.001, bleedBottom - bleedY)) * 100,
        trimWidthInBleed: (result.pieceWidth / Math.max(0.001, bleedRight - bleedX)) * 100,
        trimHeightInBleed: (result.pieceHeight / Math.max(0.001, bleedBottom - bleedY)) * 100
      };
    });
  }, [result, settings, activeBleed]);
  const previewCutMarks = useMemo(() => {
    if (settings.cropMarkLength <= 0 || !settings.showCornerMarks) return [];
    const uniqueSorted = (values: number[]) =>
      [...values]
        .sort((a, b) => a - b)
        .filter((value, index, sorted) => index === 0 || Math.abs(value - sorted[index - 1]) > 0.01);
    const columnCount = safePreviewCount(result.columns);
    const rowCount = safePreviewCount(result.rows);
    const verticalCuts = uniqueSorted(
      Array.from({ length: columnCount }, (_, column) => {
        const left = result.layoutLeft + column * (result.pieceWidth + settings.gutter);
        return [left, left + result.pieceWidth];
      }).flat()
    );
    const horizontalCuts = uniqueSorted(
      Array.from({ length: rowCount }, (_, row) => {
        const top = result.layoutTop + row * (result.pieceHeight + settings.gutter);
        return [top, top + result.pieceHeight];
      }).flat()
    );
    const guideLeft = Math.max(0, result.layoutLeft - activeBleed);
    const guideTop = Math.max(0, result.layoutTop - activeBleed);
    const guideRight = Math.min(result.sheetWidth, result.layoutLeft + result.layoutWidth + activeBleed);
    const guideBottom = Math.min(result.sheetHeight, result.layoutTop + result.layoutHeight + activeBleed);
    const markLength = settings.cropMarkLength;
    const markOffset = settings.cropMarkOffset;
    const marks: Array<{ id: string; orientation: "vertical" | "horizontal"; left: number; top: number; width: number; height: number }> = [];

    for (const x of verticalCuts) {
      marks.push({
        id: `top-${x}`,
        orientation: "vertical",
        left: (x / result.sheetWidth) * 100,
        top: ((guideTop - markOffset - markLength) / result.sheetHeight) * 100,
        width: 0,
        height: (markLength / result.sheetHeight) * 100
      });
      marks.push({
        id: `bottom-${x}`,
        orientation: "vertical",
        left: (x / result.sheetWidth) * 100,
        top: ((guideBottom + markOffset) / result.sheetHeight) * 100,
        width: 0,
        height: (markLength / result.sheetHeight) * 100
      });
    }

    for (const y of horizontalCuts) {
      marks.push({
        id: `left-${y}`,
        orientation: "horizontal",
        left: ((guideLeft - markOffset - markLength) / result.sheetWidth) * 100,
        top: (y / result.sheetHeight) * 100,
        width: (markLength / result.sheetWidth) * 100,
        height: 0
      });
      marks.push({
        id: `right-${y}`,
        orientation: "horizontal",
        left: ((guideRight + markOffset) / result.sheetWidth) * 100,
        top: (y / result.sheetHeight) * 100,
        width: (markLength / result.sheetWidth) * 100,
        height: 0
      });
    }

    return marks;
  }, [activeBleed, result, settings.cropMarkLength, settings.cropMarkOffset, settings.gutter, settings.showCornerMarks]);

  function bleedEdgeZones(piece: (typeof pieces)[number]) {
    const left = piece.trimLeftInBleed;
    const top = piece.trimTopInBleed;
    const width = piece.trimWidthInBleed;
    const height = piece.trimHeightInBleed;
    const right = Math.max(0, 100 - left - width);
    const bottom = Math.max(0, 100 - top - height);
    const zones: Array<{
      name: string;
      left: number;
      top: number;
      width: number;
      height: number;
    }> = [];

    if (top > 0) zones.push({ name: "top", left, top: 0, width, height: top });
    if (bottom > 0) zones.push({ name: "bottom", left, top: top + height, width, height: bottom });
    if (left > 0) zones.push({ name: "left", left: 0, top, width: left, height });
    if (right > 0) zones.push({ name: "right", left: left + width, top, width: right, height });
    if (left > 0 && top > 0) zones.push({ name: "top-left", left: 0, top: 0, width: left, height: top });
    if (right > 0 && top > 0) zones.push({ name: "top-right", left: left + width, top: 0, width: right, height: top });
    if (left > 0 && bottom > 0) zones.push({ name: "bottom-left", left: 0, top: top + height, width: left, height: bottom });
    if (right > 0 && bottom > 0) zones.push({ name: "bottom-right", left: left + width, top: top + height, width: right, height: bottom });

    return zones;
  }

  function bleedSourceFrameStyle(zone: ReturnType<typeof bleedEdgeZones>[number], piece: (typeof pieces)[number]): CSSProperties {
    const isTop = zone.name.includes("top");
    const isBottom = zone.name.includes("bottom");
    const isLeft = zone.name.includes("left");
    const isRight = zone.name.includes("right");
    const sampleWidth = Math.max(0.005, Math.min(DUPLICATION_EDGE_SAMPLE_INCHES, result.pieceWidth / 20));
    const sampleHeight = Math.max(0.005, Math.min(DUPLICATION_EDGE_SAMPLE_INCHES, result.pieceHeight / 20));
    const sampleWidthInBleed = piece.trimWidthInBleed * (sampleWidth / Math.max(0.001, result.pieceWidth));
    const sampleHeightInBleed = piece.trimHeightInBleed * (sampleHeight / Math.max(0.001, result.pieceHeight));
    const visibleSourceWidth =
      settings.bleedType === "duplication" && (isLeft || isRight)
        ? sampleWidthInBleed
        : zone.width;
    const visibleSourceHeight =
      settings.bleedType === "duplication" && (isTop || isBottom)
        ? sampleHeightInBleed
        : zone.height;
    const widthScale = (piece.trimWidthInBleed / Math.max(0.001, visibleSourceWidth)) * 100;
    const heightScale = (piece.trimHeightInBleed / Math.max(0.001, visibleSourceHeight)) * 100;
    let leftOffset = isRight ? 100 - widthScale : 0;
    let topOffset = isBottom ? 100 - heightScale : 0;
    let transform: string | undefined;
    let transformOrigin = "center center";

    if (settings.bleedType === "mirror") {
      if (isTop) {
        topOffset = 100;
        transform = "scaleY(-1)";
        transformOrigin = "top center";
      }
      if (isBottom) {
        topOffset = -heightScale;
        transform = "scaleY(-1)";
        transformOrigin = "bottom center";
      }
      if (isLeft) {
        leftOffset = 100;
        transform = transform ? `${transform} scaleX(-1)` : "scaleX(-1)";
        transformOrigin = isTop ? "top left" : isBottom ? "bottom left" : "center left";
      }
      if (isRight) {
        leftOffset = -widthScale;
        transform = transform ? `${transform} scaleX(-1)` : "scaleX(-1)";
        transformOrigin = isTop ? "top right" : isBottom ? "bottom right" : "center right";
      }
    }

    return {
      position: "absolute",
      left: `${leftOffset}%`,
      top: `${topOffset}%`,
      width: `${widthScale}%`,
      height: `${heightScale}%`,
      overflow: "hidden",
      transform,
      transformOrigin
    };
  }

  async function handleFile(file: File | null) {
    if (!file) return;
    const allowed = file.type === "application/pdf" || file.type === "image/png" || file.type === "image/jpeg" || /\.(pdf|png|jpe?g)$/i.test(file.name);
    if (!allowed) {
      setError("Use a PDF, PNG, or JPG artwork file.");
      return;
    }
    setRendering(true);
    setError("");
    setNotice("");
    try {
      const previewDataUrl = await renderArtworkPreview(file);
      const firstPage = previewDataUrl.pages[0];
      const detectedCrop = firstPage ? detectLikelyUploadedMarks(firstPage, pieceWidth, pieceHeight) : 0;
      const detectedBleed = firstPage?.detectedBleed ?? 0;
      const nextSettings: ImpositionSettings = {
        ...settings,
        bookletPageCount: settings.mode === "booklet" ? previewDataUrl.pageCount : settings.bookletPageCount
      };
      if (detectedCrop > 0 && (settings.artworkBoxMode !== "trim-marks" || !settings.artworkCrop)) {
        Object.assign(nextSettings, { artworkBoxMode: "trim-marks", artworkCrop: detectedCrop });
      }
      if (detectedBleed > 0 && settings.bleed === 0) {
        Object.assign(nextSettings, {
          imageBleedEnabled: true, bleed: detectedBleed, bleedTop: detectedBleed, bleedRight: detectedBleed,
          bleedBottom: detectedBleed, bleedLeft: detectedBleed, keepBleedMargins: true
        });
      }
      onSettingsChange(nextSettings);
      onArtworkChange({ file, name: file.name, ...previewDataUrl });

      if (variant === "upload" && firstPage) {
        const detectedWidth = firstPage.trimWidthInches && firstPage.trimWidthInches > 0
          ? firstPage.trimWidthInches
          : detectedCrop > 0
            ? Math.max(0.1, firstPage.widthInches - detectedCrop * 2)
            : firstPage.widthInches;
        const detectedHeight = firstPage.trimHeightInches && firstPage.trimHeightInches > 0
          ? firstPage.trimHeightInches
          : detectedCrop > 0
            ? Math.max(0.1, firstPage.heightInches - detectedCrop * 2)
            : firstPage.heightInches;
        onUseArtworkSize(Number(detectedWidth.toFixed(3)), Number(detectedHeight.toFixed(3)));
        setNotice(`Finished size set automatically from artwork: ${formatInches(detectedWidth)} x ${formatInches(detectedHeight)}.`);
      }
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : "Could not preview artwork.");
    } finally {
      setRendering(false);
      setDragActive(false);
    }
  }

  function selectArtworkPage(pageIndex: number) {
    const page = artwork.pages?.[pageIndex];
    if (!page) return;
    onArtworkChange({
      ...artwork,
      selectedPageIndex: pageIndex,
      previewDataUrl: page.previewDataUrl,
      widthInches: page.widthInches,
      heightInches: page.heightInches
    });
  }

  useEffect(() => {
    setBookletSideIndex((current) => Math.min(current, Math.max(0, bookletPressSideCount - 1)));
  }, [bookletPressSideCount]);

  function bookletSourcePageNumber(index: number) {
    const column = index % Math.max(1, result.columns);
    const signatureIndex = Math.floor(bookletSideIndex / 2);
    const isBack = bookletSideIndex % 2 === 1;
    const isRight = column % 2 === 1;
    const ltrPage = !isBack
      ? (isRight ? 1 + signatureIndex * 2 : bookletPaddedPageCount - signatureIndex * 2)
      : (isRight ? bookletPaddedPageCount - 1 - signatureIndex * 2 : 2 + signatureIndex * 2);
    if (bookletReadingDirection === "ltr") return ltrPage;
    return !isBack
      ? (isRight ? bookletPaddedPageCount - signatureIndex * 2 : 1 + signatureIndex * 2)
      : (isRight ? 2 + signatureIndex * 2 : bookletPaddedPageCount - 1 - signatureIndex * 2);
  }

  function bookletSourcePageIndex(index: number) {
    if (!artwork.pages?.length) return -1;
    const oneBasedPage = bookletSourcePageNumber(index);
    return oneBasedPage >= 1 && oneBasedPage <= artwork.pages.length ? oneBasedPage - 1 : -1;
  }

  function setImpositionMode(mode: ImpositionMode) {
    const nextSettings: ImpositionSettings = {
      ...settings,
      mode,
      ...(mode === "booklet" ? {
        bookletPageCount: sourcePageCount || settings.bookletPageCount || 4,
        showFoldMarks: true,
        cropMarkLength: settings.cropMarkLength > 0 ? settings.cropMarkLength : 0.125,
        cropMarkOffset: settings.cropMarkOffset > 0 ? settings.cropMarkOffset : 0.0625
      } : {})
    };
    onSettingsChange(nextSettings);
    if (mode === "booklet") setBookletSideIndex(0);
    if (mode === "step-repeat" && artwork.pages?.length && selectedPageIndex !== 0) {
      selectArtworkPage(0);
    }
  }

  function usesAllArtworkPages() {
    return settings.mode === "repeat-all-pages" || settings.mode === "join-pages" || settings.mode === "booklet";
  }

  function pageIndexForPiece(index: number) {
    if (!artwork.pages?.length) return 0;
    if (settings.mode === "booklet") return bookletSourcePageIndex(index);
    return usesAllArtworkPages() ? index % artwork.pages.length : 0;
  }

  function impositionModeLabel() {
    if (settings.mode === "booklet") return "Booklet / saddle stitch";
    if (settings.mode === "join-pages") return "Gang pages";
    if (settings.mode === "repeat-all-pages") return "Repeat all pages";
    return "Page 1 only";
  }

  function previewForPiece(index: number) {
    if (!artwork.pages?.length) return artwork.previewDataUrl;
    const pageIndex = pageIndexForPiece(index);
    if (pageIndex < 0) return undefined;
    return artwork.pages[pageIndex]?.previewDataUrl ?? artwork.previewDataUrl;
  }

  function pageForPiece(index: number) {
    if (!artwork.pages?.length) return undefined;
    const pageIndex = pageIndexForPiece(index);
    return pageIndex >= 0 ? artwork.pages[pageIndex] : undefined;
  }

  function duplicationPreviewForPiece(index: number) {
    if (!artwork.pages?.length) return undefined;
    const pageIndex = pageIndexForPiece(index);
    if (pageIndex < 0) return undefined;
    return duplicationPreviews[pageIndex] ?? duplicationPreviews[0];
  }

  function artworkPlacementStyle(page?: ArtworkPage): CSSProperties {
    const style: CSSProperties = {};
    const transforms: string[] = [];
    const normalizedRotation = normalizeRotation(appliedArtworkRotation);

    if (normalizedRotation > 0) {
      style.position = "absolute";
      style.left = "50%";
      style.top = "50%";
      if (isQuarterTurn(normalizedRotation)) {
        style.width = `${(result.pieceHeight / result.pieceWidth) * 100}%`;
        style.height = `${(result.pieceWidth / result.pieceHeight) * 100}%`;
      } else {
        style.width = "100%";
        style.height = "100%";
      }
      transforms.push("translate(-50%, -50%)", `rotate(${normalizedRotation}deg)`);
    }

    if (settings.artworkBoxMode === "trim-marks" && settings.artworkCrop && page) {
      const cropXPercent = Math.min(45, (settings.artworkCrop / page.widthInches) * 100);
      const cropYPercent = Math.min(45, (settings.artworkCrop / page.heightInches) * 100);
      const scaleX = 1 / Math.max(0.1, 1 - (cropXPercent * 2) / 100);
      const scaleY = 1 / Math.max(0.1, 1 - (cropYPercent * 2) / 100);
      style.clipPath = `inset(${cropYPercent}% ${cropXPercent}%)`;
      transforms.push(`scale(${scaleX}, ${scaleY})`);
    }

    if (transforms.length) {
      style.transform = transforms.join(" ");
      style.transformOrigin = "center center";
    }

    return style;
  }

  function useExactArtworkSize() {
    if (!trimmedArtworkWidth || !trimmedArtworkHeight) return;
    onUseArtworkSize(trimmedArtworkWidth, trimmedArtworkHeight);
    onSettingsChange({ ...settings, preset: "auto", fitMode: "contain" });
    setNotice(`Finished size set from PDF: ${formatInches(trimmedArtworkWidth)} x ${formatInches(trimmedArtworkHeight)}.`);
  }

  function swapFinishedSize() {
    onUseArtworkSize(pieceHeight, pieceWidth);
    onSettingsChange({ ...settings, preset: "auto" });
    setNotice(`Finished size swapped to ${formatInches(pieceHeight)} x ${formatInches(pieceWidth)}.`);
  }

  function applyFinishedSizeHelper(action: string) {
    if (action === "swap") {
      swapFinishedSize();
      return;
    }
    if (action === "pdf") {
      useExactArtworkSize();
    }
  }

  function updateRotationMode(nextRotationMode: RotationMode) {
    onSettingsChange({
      ...settings,
      rotationMode: nextRotationMode,
      rotate: nextRotationMode === "90" || nextRotationMode === "270"
    });
  }

  function forceSelectedSheetSize() {
    onUseSheetSize(stock.sheetWidth, stock.sheetHeight);
    onSettingsChange({
      ...settings,
      preset: "custom",
      customColumns: 1,
      customRows: 1,
      rotate: false,
      rotationMode: "0",
      fitMode: "stretch",
      margin: 0,
      gutter: 0,
      bleed: 0
    });
    setNotice(`Page size forced to ${stock.sheetWidth} x ${stock.sheetHeight}. Artwork will stretch to the selected sheet.`);
  }

  function setLayoutPreset(preset: UpPreset) {
    onSettingsChange({ ...settings, preset });
  }

  function setFitMode(fitMode: FitMode) {
    onSettingsChange({ ...settings, fitMode });
  }

  function setBleedType(bleedType: BleedType) {
    onSettingsChange({ ...settings, bleedType });
  }

  function syncBleedSides(value: number) {
    onSettingsChange({
      ...settings,
      imageBleedEnabled: value > 0 ? true : settings.imageBleedEnabled,
      bleed: value,
      bleedTop: value,
      bleedRight: value,
      bleedBottom: value,
      bleedLeft: value,
      keepBleedMargins: true,
    });
  }

  function updateBleedSide(side: "bleedTop" | "bleedRight" | "bleedBottom" | "bleedLeft", value: number) {
    if (settings.bleedLinked) {
      syncBleedSides(value);
      return;
    }

    const nextSettings = { ...settings, imageBleedEnabled: value > 0 ? true : settings.imageBleedEnabled, [side]: value };
    const bleed = Math.max(nextSettings.bleedTop, nextSettings.bleedRight, nextSettings.bleedBottom, nextSettings.bleedLeft);
    onSettingsChange({ ...nextSettings, bleed });
  }

  function updateTrimSide(side: "trimTop" | "trimRight" | "trimBottom" | "trimLeft", value: number) {
    if (settings.trimLinked) {
      onSettingsChange({
        ...settings,
        artworkBoxMode: value > 0 ? "trim-marks" : settings.artworkBoxMode,
        artworkCrop: value,
        trimTop: value,
        trimRight: value,
        trimBottom: value,
        trimLeft: value
      });
      return;
    }

    const nextSettings = { ...settings, artworkBoxMode: value > 0 ? "trim-marks" : settings.artworkBoxMode, [side]: value };
    const artworkCrop = Math.max(nextSettings.trimTop, nextSettings.trimRight, nextSettings.trimBottom, nextSettings.trimLeft);
    onSettingsChange({ ...nextSettings, artworkCrop });
  }

  function savePreset() {
    const savedPreset = {
      name: `${stock.name} / ${pieceWidth}x${pieceHeight}`,
      createdAt: new Date().toISOString(),
      stockId: stock.id,
      pieceWidth,
      pieceHeight,
      quantity,
      settings
    };
    const saved = JSON.parse(window.localStorage.getItem("gross-printing-imposition-presets") || "[]") as unknown[];
    window.localStorage.setItem("gross-printing-imposition-presets", JSON.stringify([savedPreset, ...saved].slice(0, 30)));
    setNotice("Preset saved in this demo browser.");
  }

  async function downloadImposedPdf(printAfterDownload = false) {
    if (!artwork.file || !artwork.previewDataUrl) {
      setError("Upload a PDF, PNG, or JPG artwork file first.");
      return;
    }
    if (settings.mode === "booklet" && result.columns < 2) {
      setError("Booklet imposition needs at least two pages side by side. Choose a larger parent sheet before downloading.");
      return;
    }
    setGenerating(true);
    setError("");
    try {
      const pdfBytes = await createImposedPdf({
        file: artwork.file,
        previewDataUrl: artwork.previewDataUrl,
        pages: artwork.pages,
        selectedPageIndex,
        result,
        settings
      });
      const pdfBuffer = new ArrayBuffer(pdfBytes.byteLength);
      new Uint8Array(pdfBuffer).set(pdfBytes);
      const blob = new Blob([pdfBuffer], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      if (printAfterDownload) {
        window.open(url, "_blank", "noopener,noreferrer");
      } else {
        const anchor = document.createElement("a");
        anchor.href = url;
        const fallbackBaseName = `imposed-${artwork.name?.replace(/\.[^.]+$/, "") || "sheet"}`;
        anchor.download = `${safeProductionFileBaseName(downloadFileBaseName || fallbackBaseName)}.pdf`;
        anchor.click();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
      }
    } catch (pdfError) {
      setError(pdfError instanceof Error ? pdfError.message : "Could not generate imposed PDF.");
    } finally {
      setGenerating(false);
    }
  }

  if (variant === "upload") {
    return (
      <section
        className={`artwork-upload-compact ${dragActive ? "drag-active" : ""}`}
        onDragEnter={(event) => { event.preventDefault(); setDragActive(true); }}
        onDragOver={(event) => { event.preventDefault(); setDragActive(true); }}
        onDragLeave={(event) => {
          if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
          setDragActive(false);
        }}
        onDrop={(event) => { event.preventDefault(); setDragActive(false); void handleFile(event.dataTransfer.files?.[0] ?? null); }}
      >
        <input ref={inputRef} className="sr-only" type="file" accept="application/pdf,image/png,image/jpeg" onChange={(event) => void handleFile(event.target.files?.[0] ?? null)} />
        <button className="artwork-upload-button" type="button" onClick={() => inputRef.current?.click()} disabled={rendering}>
          <FileUp size={24} />
          <span>
            <strong>{rendering ? "Reading artwork..." : dragActive ? "Drop artwork here" : artwork.name ? "Drop a replacement PDF here" : "Drag PDF here or click to choose"}</strong>
            <small>PDF, PNG, or JPG · size is detected automatically</small>
          </span>
        </button>
        <div className="artwork-upload-meta">
          <strong>{artwork.name ?? "No artwork attached"}</strong>
          <span>{artwork.name ? `${artwork.pageCount ?? 1} page${(artwork.pageCount ?? 1) === 1 ? "" : "s"} · ${activeArtworkWidth && activeArtworkHeight ? `${formatInches(activeArtworkWidth)} x ${formatInches(activeArtworkHeight)}` : "size reading"} · ${activeOrientation}` : "Drop the customer PDF above and Job Setup will use its detected page/trim size."}</span>
        </div>
        {artwork.previewDataUrl ? <div className="artwork-upload-preview"><img src={artwork.previewDataUrl} alt={`Preview of ${artwork.name ?? "artwork"}`} /></div> : null}
        {error ? <p className="imposition-error">{error}</p> : null}
        {notice ? <p className="imposition-notice">{notice}</p> : null}
      </section>
    );
  }

  return (
    <section className={`imposition-studio ${variant === "production" ? "production-compact" : ""}`}>
      {variant !== "production" ? <div className="section-heading compact imposition-title-row">
        <div>
          <p>PDF upload and imposition</p>
          <h2>Production setup</h2>
        </div>
        <div className="toolbar-actions">
          <button className="icon-button text-button" type="button" onClick={savePreset}>
            <Save size={16} />
            Save preset
          </button>
        </div>
        <input
          ref={inputRef}
          className="sr-only"
          type="file"
          accept="application/pdf,image/png,image/jpeg"
          onChange={(event) => void handleFile(event.target.files?.[0] ?? null)}
        />
      </div> : <input ref={inputRef} className="sr-only" type="file" accept="application/pdf,image/png,image/jpeg" onChange={(event) => void handleFile(event.target.files?.[0] ?? null)} />}

      <div className="imposition-bench">
        <aside className="imposition-settings">
          {variant !== "production" ? (
            <section className="imposition-control-card upload-card imposition-step-card">
              <h3>Artwork</h3>
              <button className="upload-drop-button" type="button" onClick={() => inputRef.current?.click()}>
                <FileUp size={20} />
                <strong>{artwork.name ? artwork.name : "Choose PDF or artwork"}</strong>
                <span>{artwork.pageCount ? `${artwork.pageCount} page${artwork.pageCount === 1 ? "" : "s"}` : "PDF, PNG, or JPG"}</span>
              </button>
              <div className="file-facts">
                <div><span>Page size</span><strong>{activeArtworkWidth && activeArtworkHeight ? `${activeArtworkWidth} x ${activeArtworkHeight}` : "-"}</strong></div>
                <div><span>Direction</span><strong>{activeOrientation}</strong></div>
                <div><span>Bleed</span><strong>{bleedReadout}</strong></div>
              </div>
            </section>
          ) : (
            <section className="imposition-control-card production-source-summary">
              <span>Using customer file</span>
              <strong>{artwork.name ?? "Artwork"}</strong>
              <small>{activeArtworkWidth && activeArtworkHeight ? `${activeArtworkWidth} × ${activeArtworkHeight} in · ${artwork.pageCount ?? 1} page${(artwork.pageCount ?? 1) === 1 ? "" : "s"}` : `${artwork.pageCount ?? 1} page${(artwork.pageCount ?? 1) === 1 ? "" : "s"}`}</small>
              <em>No re-upload needed. This is the same file loaded in Job Setup.</em>
            </section>
          )}

          <details className="imposition-control-card imposition-step-card" open>
            <summary>
              <span><em>2</em> Layout</span>
              <strong>{result.columns} x {result.rows}</strong>
            </summary>
            <div className="step-body">
              <label>
                Mode
                <select value={settings.mode} onChange={(event) => setImpositionMode(event.target.value as ImpositionMode)}>
                  <option value="step-repeat">Use page 1 only</option>
                  <option value="repeat-all-pages">Repeat all pages</option>
                  <option value="join-pages">Gang pages together</option>
                  <option value="booklet">Booklet / saddle stitch</option>
                </select>
              </label>
              {settings.mode === "booklet" ? (
                <div className="booklet-imposition-setup">
                  <div className="booklet-setup-title">
                    <strong>Booklet setup</strong>
                    <span>Saddle stitch · automatic printer spreads</span>
                  </div>
                  <label className="booklet-direction-control">
                    Reading / binding direction
                    <select
                      value={bookletReadingDirection}
                      onChange={(event) => onSettingsChange({ ...settings, bookletReadingDirection: event.target.value as "ltr" | "rtl" })}
                    >
                      <option value="ltr">English — left to right</option>
                      <option value="rtl">Hebrew / Yiddish — right to left</option>
                    </select>
                  </label>
                  <div className="booklet-setup-facts">
                    <div><span>PDF pages</span><strong>{sourcePageCount || "-"}</strong></div>
                    <div><span>Nested sheets</span><strong>{sourcePageCount ? bookletSignatureCount : "-"}</strong></div>
                    <div><span>Copies / parent</span><strong>{bookletCopiesPerParent}</strong></div>
                    <div><span>Press sides</span><strong>{sourcePageCount ? bookletPressSideCount : "-"}</strong></div>
                  </div>
                  <p className="trim-readout">
                    Pages are reordered automatically for folding and stapling. {bookletReadingDirection === "rtl"
                      ? "Right-to-left example: a 12-page booklet starts 1 + 12 on the front, then 11 + 2 on the back."
                      : "English example: a 12-page booklet starts 12 + 1 on the front, then 2 + 11 on the back."}
                  </p>
                  {bookletBlankPages > 0 ? <p className="imposition-notice">Adds {bookletBlankPages} blank page{bookletBlankPages === 1 ? "" : "s"} so the booklet is a multiple of 4.</p> : null}
                </div>
              ) : null}
              <label>
                Layout preset
                <select value={settings.preset} onChange={(event) => setLayoutPreset(event.target.value as UpPreset)}>
                  {MANUAL_UP_PRESETS.map((preset) => (
                    <option value={preset} key={preset}>{presetLabel(preset)}</option>
                  ))}
                </select>
              </label>
              {settings.preset === "custom" ? (
                <div className="mini-grid two-even">
                  <label>
                    Columns
                    <input
                      type="number"
                      min="1"
                      max="20"
                      value={settings.customColumns}
                      onChange={(event) => onSettingsChange({ ...settings, customColumns: Number(event.target.value) })}
                    />
                  </label>
                  <label>
                    Rows
                    <input
                      type="number"
                      min="1"
                      max="20"
                      value={settings.customRows}
                      onChange={(event) => onSettingsChange({ ...settings, customRows: Number(event.target.value) })}
                    />
                  </label>
                </div>
              ) : null}
              <label>
                Artwork rotation
                <select value={rotationMode} onChange={(event) => updateRotationMode(event.target.value as RotationMode)}>
                  <option value="0">0 degrees</option>
                  <option value="90">90 degrees</option>
                  <option value="180">180 degrees</option>
                  <option value="270">270 degrees</option>
                </select>
              </label>
              <p className="trim-readout">{rotationStatus}</p>
            </div>
          </details>

          <details className="imposition-control-card artwork-size-card imposition-step-card">
            <summary>
              <span><em>3</em> Finished size</span>
              <strong>{formatInches(pieceWidth)} x {formatInches(pieceHeight)}</strong>
            </summary>
            <div className="step-body">
              <label>
                Quick action
                <select value="" onChange={(event) => applyFinishedSizeHelper(event.target.value)}>
                  <option value="">Keep product size ({formatInches(pieceWidth)} x {formatInches(pieceHeight)})</option>
                  <option value="swap">Swap width / height</option>
                  <option value="pdf" disabled={!trimmedArtworkWidth || !trimmedArtworkHeight}>
                    Use PDF size{trimmedArtworkWidth && trimmedArtworkHeight ? ` (${formatInches(trimmedArtworkWidth)} x ${formatInches(trimmedArtworkHeight)})` : ""}
                  </option>
                </select>
              </label>
              <p className="trim-readout">Size is set once in Product setup. Use this only when the artwork changes the finished size.</p>
            </div>
          </details>

          <details className="imposition-control-card imposition-step-card">
            <summary>
              <span><em>4</em> Fit and spacing</span>
              <strong>{settings.fitMode}</strong>
            </summary>
            <div className="step-body">
              <div className="segmented">
                <button className={settings.fitMode === "contain" ? "active" : ""} type="button" onClick={() => setFitMode("contain")}>
                  <Minimize2 size={15} />
                  Fit whole
                </button>
                <button className={settings.fitMode === "cover" ? "active" : ""} type="button" onClick={() => setFitMode("cover")}>
                  <Expand size={15} />
                  Fill piece
                </button>
                <button className={settings.fitMode === "stretch" ? "active" : ""} type="button" onClick={() => setFitMode("stretch")}>
                  <Maximize2 size={15} />
                  Stretch
                </button>
              </div>
              <button className="icon-button text-button full" type="button" onClick={forceSelectedSheetSize}>
                <Maximize2 size={16} />
                Force page to selected sheet ({stock.sheetWidth} x {stock.sheetHeight})
              </button>
              <div className="mini-grid two-even">
                <label>
                  Margin
                  <input type="number" min="0" step="0.0625" value={settings.margin} onChange={(event) => onSettingsChange({ ...settings, margin: Number(event.target.value) })} />
                </label>
                <label>
                  Gutter
                  <input type="number" min="0" step="0.0625" value={settings.gutter} onChange={(event) => onSettingsChange({ ...settings, gutter: Number(event.target.value) })} />
                </label>
              </div>
            </div>
          </details>

          <details className="imposition-control-card bleed-panel imposition-step-card">
            <summary>
              <span><em>5</em> Bleed and marks</span>
              <strong>{settings.imageBleedEnabled ? settings.bleedType : "off"}</strong>
            </summary>
            <div className="step-body">
              <label className="checkbox-pill full bleed-enable">
                <input
                  type="checkbox"
                  checked={settings.imageBleedEnabled}
                  onChange={(event) =>
                    onSettingsChange({
                      ...settings,
                      imageBleedEnabled: event.target.checked,
                      keepBleedMargins: true
                    })
                  }
                />
                Enable Image Bleed
              </label>

              {settings.imageBleedEnabled ? (
                <>
                  <div className="bleed-dialog-grid">
                    <div className="bleed-dialog-box">
                      <div className="bleed-box-heading">
                        <strong>Bleed Setup</strong>
                        <label className="mini-link-toggle">
                          <input type="checkbox" checked={settings.bleedLinked} onChange={(event) => onSettingsChange({ ...settings, bleedLinked: event.target.checked })} />
                          Link
                        </label>
                      </div>
                      <div className="bleed-side-list">
                        {([
                          ["Top", "bleedTop"],
                          ["Bottom", "bleedBottom"],
                          ["Left", "bleedLeft"],
                          ["Right", "bleedRight"]
                        ] as const).map(([label, key]) => (
                          <label className="bleed-side-row" key={key}>
                            <span>{label}</span>
                            <input type="number" min="0" step="0.0625" value={settings[key]} onChange={(event) => updateBleedSide(key, Number(event.target.value))} />
                          </label>
                        ))}
                      </div>
                    </div>

                    <div className="bleed-dialog-box">
                      <div className="bleed-box-heading">
                        <strong>Trim Box</strong>
                        <label className="mini-link-toggle">
                          <input type="checkbox" checked={settings.trimLinked} onChange={(event) => onSettingsChange({ ...settings, trimLinked: event.target.checked })} />
                          Link
                        </label>
                      </div>
                      <div className="bleed-side-list">
                        {([
                          ["Top", "trimTop"],
                          ["Bottom", "trimBottom"],
                          ["Left", "trimLeft"],
                          ["Right", "trimRight"]
                        ] as const).map(([label, key]) => (
                          <label className="bleed-side-row" key={key}>
                            <span>{label}</span>
                            <input type="number" min="0" step="0.0625" value={settings[key]} onChange={(event) => updateTrimSide(key, Number(event.target.value))} />
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>

                  <label>
                    Bleed Type
                    <select value={settings.bleedType} onChange={(event) => setBleedType(event.target.value as BleedType)}>
                      <option value="color">Color</option>
                      <option value="mirror">Mirror</option>
                      <option value="duplication">Duplication</option>
                    </select>
                  </label>

                  <label className={`bleed-color-row ${settings.bleedType === "color" ? "" : "disabled-field"}`}>
                    <span>Color</span>
                    <input
                      type="color"
                      value={settings.bleedColor}
                      disabled={settings.bleedType !== "color"}
                      onChange={(event) => onSettingsChange({ ...settings, bleedColor: event.target.value })}
                    />
                  </label>

                  <div className="bleed-status">
                    <span>PDF bleed</span>
                    <strong>{activeDetectedBleed > 0 ? `${activeDetectedBleed.toFixed(3)} in` : "Not found"}</strong>
                  </div>

                  <div className="bleed-dialog-box bleed-mark-box">
                    <div className="bleed-box-heading">
                      <strong>Bleed Marks</strong>
                      <span>Optional</span>
                    </div>
                    <div className="mini-grid two-even">
                      <label>
                        Mark length
                        <input type="number" min="0" step="0.0625" value={settings.cropMarkLength} onChange={(event) => onSettingsChange({ ...settings, cropMarkLength: Number(event.target.value) })} />
                      </label>
                      <label>
                        Mark offset
                        <input type="number" min="0" step="0.0625" value={settings.cropMarkOffset} onChange={(event) => onSettingsChange({ ...settings, cropMarkOffset: Number(event.target.value) })} />
                      </label>
                    </div>
                    <div className="bleed-marks-row">
                      <label className="checkbox-pill">
                        <input type="checkbox" checked={settings.showFoldMarks} onChange={(event) => onSettingsChange({ ...settings, showFoldMarks: event.target.checked })} />
                        Fold Marks
                      </label>
                      <label className="checkbox-pill">
                        <input type="checkbox" checked={settings.showCornerMarks} onChange={(event) => onSettingsChange({ ...settings, showCornerMarks: event.target.checked })} />
                        Side Cut Marks
                      </label>
                      <label className="checkbox-pill">
                        <input type="checkbox" checked={settings.showBleedGuide} onChange={(event) => onSettingsChange({ ...settings, showBleedGuide: event.target.checked })} />
                        Red Bleed Guide
                      </label>
                    </div>
                  </div>
                </>
              ) : (
                <p className="trim-readout">Turn this on only for artwork that needs edge bleed or cut marks.</p>
              )}

              <p className="trim-readout">
                {settings.imageBleedEnabled && settings.bleed > 0
                  ? `Bleed preview is on with ${settings.bleedType}.`
                  : "Enable image bleed and enter a bleed amount to preview it."}
              </p>
            </div>
          </details>
        </aside>

        <div className="imposition-preview-panel">
          <div className="preview-toolbar">
            <div>
              <strong>{result.sheetWidth} x {result.sheetHeight} parent sheet</strong>
              <span>
                {impositionModeLabel()} / {result.columns} x {result.rows} / {appliedArtworkRotation ? `${appliedArtworkRotation} degrees` : "upright"}
                {result.sheetRotated ? " / auto sheet rotation" : ""}
              </span>
            </div>
            <div className="zoom-controls">
              <button className="icon-only" type="button" onClick={() => setZoom((current) => Math.max(0.55, Number((current - 0.1).toFixed(2))))}>
                <ZoomOut size={16} />
              </button>
              <button className="icon-button text-button" type="button" onClick={() => setZoom(1)}>
                <Maximize2 size={15} />
                {Math.round(zoom * 100)}%
              </button>
              <button className="icon-only" type="button" onClick={() => setZoom((current) => Math.min(1.65, Number((current + 0.1).toFixed(2))))}>
                <ZoomIn size={16} />
              </button>
            </div>
          </div>

          {settings.mode === "booklet" && artwork.pages?.length ? (
            <div className="booklet-side-navigator">
              <button type="button" className="icon-button text-button" onClick={() => setBookletSideIndex((current) => Math.max(0, current - 1))} disabled={bookletSideIndex <= 0}>← Previous side</button>
              <div>
                <strong>Nested sheet {Math.floor(bookletSideIndex / 2) + 1} of {bookletSignatureCount}</strong>
                <span>{bookletSideIndex % 2 === 0 ? "Front" : "Back"} · imposed side {bookletSideIndex + 1} of {bookletPressSideCount}</span>
              </div>
              <button type="button" className="icon-button text-button" onClick={() => setBookletSideIndex((current) => Math.min(bookletPressSideCount - 1, current + 1))} disabled={bookletSideIndex >= bookletPressSideCount - 1}>Next side →</button>
            </div>
          ) : null}

          {artwork.pages?.length ? (
            <div className="pdf-page-strip">
              {artwork.pages.map((page, pageIndex) => (
                <button className={pageIndex === selectedPageIndex ? "active" : ""} type="button" key={page.pageNumber} onClick={() => selectArtworkPage(pageIndex)}>
                  <img src={page.previewDataUrl} alt="" />
                  <span>Page {page.pageNumber}</span>
                  <small>{page.widthInches} x {page.heightInches}</small>
                </button>
              ))}
            </div>
          ) : null}

          <div className="sheet-stage">
            <div
              className="sheet-preview"
              style={{
                aspectRatio: `${result.sheetWidth}/${result.sheetHeight}`,
                width: `${previewWidth}px`,
                maxWidth: zoom <= 1 ? "100%" : "none"
              }}
            >
              <div
                className="center-layout-outline"
                style={{
                  left: `${(result.layoutLeft / result.sheetWidth) * 100}%`,
                  top: `${(result.layoutTop / result.sheetHeight) * 100}%`,
                  width: `${(result.layoutWidth / result.sheetWidth) * 100}%`,
                  height: `${(result.layoutHeight / result.sheetHeight) * 100}%`
                }}
              />
              {settings.margin > 0 ? (
                <div
                  className="sheet-margin"
                  style={{
                    left: `${(settings.margin / result.sheetWidth) * 100}%`,
                    top: `${(settings.margin / result.sheetHeight) * 100}%`,
                    right: `${(settings.margin / result.sheetWidth) * 100}%`,
                    bottom: `${(settings.margin / result.sheetHeight) * 100}%`
                  }}
                />
              ) : null}
              {settings.showRegistrationMarks && settings.cropMarkLength > 0 ? (
                <>
                  <span className="registration-mark reg-top" />
                  <span className="registration-mark reg-right" />
                  <span className="registration-mark reg-bottom" />
                  <span className="registration-mark reg-left" />
                </>
              ) : null}
              {activeBleed > 0
                ? pieces.map((piece, index) => {
                    const preparedDuplicationPreview = settings.bleedType === "duplication" ? duplicationPreviewForPiece(index) : undefined;
                    const bleedPreview = preparedDuplicationPreview ?? previewForPiece(index);
                    const bleedPage = pageForPiece(index);
                    const usesPreparedDuplication = Boolean(preparedDuplicationPreview);
                    return (
                      <div
                        className={`bleed-box bleed-mode-${settings.bleedType}`}
                        key={`bleed-${piece.id}`}
                        style={{
                          left: `${piece.bleedLeft}%`,
                          top: `${piece.bleedTop}%`,
                          width: `${piece.bleedWidth}%`,
                          height: `${piece.bleedHeight}%`,
                          backgroundColor: settings.bleedType === "color" ? settings.bleedColor : undefined
                        }}
                      >
                        {bleedPreview && settings.bleedType !== "color"
                          ? bleedEdgeZones(piece).map((zone) => {
                              const zoneStyle: CSSProperties = {
                                left: `${zone.left}%`,
                                top: `${zone.top}%`,
                                width: `${zone.width}%`,
                                height: `${zone.height}%`
                              };
                              const sourceFrameStyle = bleedSourceFrameStyle(zone, piece);
                              return (
                                <span className={`bleed-edge bleed-edge-${zone.name}`} key={zone.name} style={zoneStyle}>
                                  <span className="bleed-edge-source" style={sourceFrameStyle}>
                                    <img
                                      src={bleedPreview}
                                      alt=""
                                      style={{
                                        objectFit: usesPreparedDuplication ? "fill" : previewObjectFit,
                                        objectPosition: "center center",
                                        ...(usesPreparedDuplication ? {} : artworkPlacementStyle(bleedPage))
                                      }}
                                    />
                                  </span>
                                </span>
                              );
                            })
                          : null}
                      </div>
                    );
                  })
                : null}
              {previewCutMarks.map((mark) => (
                <span
                  className={`side-cut-mark ${mark.orientation}`}
                  key={mark.id}
                  style={{
                    left: `${mark.left}%`,
                    top: `${mark.top}%`,
                    width: mark.orientation === "horizontal" ? `${mark.width}%` : undefined,
                    height: mark.orientation === "vertical" ? `${mark.height}%` : undefined
                  }}
                />
              ))}
              {pieces.map((piece, index) => {
                const preview = previewForPiece(index);
                const piecePage = pageForPiece(index);
                return (
                  <div
                    className="imposed-piece"
                    key={piece.id}
                    style={{
                      left: `${piece.left}%`,
                      top: `${piece.top}%`,
                      width: `${piece.width}%`,
                      height: `${piece.height}%`
                    }}
                  >
                    {preview ? (
                      <img
                        src={preview}
                        alt=""
                        style={{
                          objectFit: previewObjectFit,
                          objectPosition: "center center",
                          ...artworkPlacementStyle(piecePage)
                        }}
                      />
                    ) : null}
                    {settings.mode === "booklet" ? (
                      <span className="booklet-page-label">{bookletSourcePageNumber(index) <= sourcePageCount ? `P${bookletSourcePageNumber(index)}` : "Blank"}</span>
                    ) : null}
                  </div>
                );
              })}
              {!artwork.previewDataUrl ? (
                <div className="sheet-empty-overlay">
                  <FileUp size={24} />
                  <strong>{rendering ? "Rendering preview..." : "Upload artwork to preview the real imposed sheet"}</strong>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <aside className="imposition-summary">
          <section className="imposition-control-card production-output-card">
            <h3>Production output</h3>
            <div className="calc-panel compact lean">
              <div><span>Grid</span><strong>{result.columns} x {result.rows}</strong></div>
              {settings.mode === "booklet" ? <div><span>Booklet</span><strong>{bookletPaddedPageCount} pages / {bookletSignatureCount} nested sheets</strong></div> : null}
              {settings.mode === "booklet" ? <div><span>Reading</span><strong>{bookletReadingDirection === "rtl" ? "Right to left" : "Left to right"}</strong></div> : null}
              {settings.mode === "booklet" ? <div><span>Copies / parent</span><strong>{bookletCopiesPerParent}</strong></div> : null}
              <div><span>Waste</span><strong>{result.wastePercent.toFixed(1)}%</strong></div>
              <div><span>Piles</span><strong>{result.piles}</strong></div>
              <div><span>Cuts</span><strong>{result.cutsPerPile}</strong></div>
              <div><span>Est. time</span><strong>{result.estimatedMinutes} min</strong></div>
            </div>
            <div className="output-actions">
              <button className="primary-button full" type="button" onClick={() => void downloadImposedPdf(false)} disabled={generating || !artwork.file}>
                <Download size={16} />
                Download imposed PDF
              </button>
              <button className="icon-button text-button full" type="button" onClick={() => void downloadImposedPdf(true)} disabled={generating || !artwork.file}>
                <Printer size={16} />
                Print preview
              </button>
            </div>
            {notice ? <p className="success-text">{notice}</p> : null}
            {error ? <p className="error-text">{error}</p> : null}
            <div className="warning-list">
              {warnings.length ? warnings.map((warning) => <p key={warning}>{warning}</p>) : <p>File and layout look ready for this demo output.</p>}
            </div>
          </section>
        </aside>
      </div>
    </section>
  );
}
