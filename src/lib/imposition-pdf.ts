import type { ImpositionResult, ImpositionSettings } from "./types";

const POINTS_PER_INCH = 72;

async function getImageDimensions(dataUrl: string) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = reject;
    image.src = dataUrl;
  });
}

async function loadImage(dataUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = dataUrl;
  });
}

function dataUrlToBytes(dataUrl: string) {
  const base64 = dataUrl.split(",")[1] ?? "";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function normalizeRotation(rotation: number | undefined) {
  return (((rotation ?? 0) % 360) + 360) % 360;
}

function isQuarterTurn(rotation: number | undefined) {
  const normalized = normalizeRotation(rotation);
  return normalized === 90 || normalized === 270;
}

function fitRect(
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
  mode: "contain" | "cover" | "stretch"
) {
  if (mode === "stretch") {
    return {
      width: targetWidth,
      height: targetHeight,
      xOffset: 0,
      yOffset: 0
    };
  }

  const scale =
    mode === "cover"
      ? Math.max(targetWidth / sourceWidth, targetHeight / sourceHeight)
      : Math.min(targetWidth / sourceWidth, targetHeight / sourceHeight);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  return {
    width,
    height,
    xOffset: (targetWidth - width) / 2,
    yOffset: (targetHeight - height) / 2
  };
}

async function renderFinalPieceDataUrl(options: {
  previewDataUrl: string;
  widthInches?: number;
  heightInches?: number;
  result: ImpositionResult;
  settings: ImpositionSettings;
}) {
  const image = await loadImage(options.previewDataUrl);
  const pieceRatio = options.result.pieceWidth / Math.max(0.001, options.result.pieceHeight);
  const longSide = 1200;
  const canvasWidth = Math.round(pieceRatio >= 1 ? longSide : Math.max(180, longSide * pieceRatio));
  const canvasHeight = Math.round(pieceRatio >= 1 ? Math.max(180, longSide / pieceRatio) : longSide);
  const canvas = document.createElement("canvas");
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const context = canvas.getContext("2d");
  if (!context) return options.previewDataUrl;

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);

  const cropX =
    options.settings.artworkBoxMode === "trim-marks" && options.widthInches
      ? Math.min(image.naturalWidth / 2 - 1, options.settings.artworkCrop * (image.naturalWidth / options.widthInches))
      : 0;
  const cropY =
    options.settings.artworkBoxMode === "trim-marks" && options.heightInches
      ? Math.min(image.naturalHeight / 2 - 1, options.settings.artworkCrop * (image.naturalHeight / options.heightInches))
      : 0;
  const sourceX = Math.max(0, cropX);
  const sourceY = Math.max(0, cropY);
  const sourceWidth = Math.max(1, image.naturalWidth - sourceX * 2);
  const sourceHeight = Math.max(1, image.naturalHeight - sourceY * 2);
  const artworkRotation = normalizeRotation(options.result.artworkRotation ?? (options.result.artworkRotated ? 90 : 0));
  const quarterTurn = isQuarterTurn(artworkRotation);
  const layoutSourceWidth = quarterTurn ? sourceHeight : sourceWidth;
  const layoutSourceHeight = quarterTurn ? sourceWidth : sourceHeight;
  const fitted = fitRect(layoutSourceWidth, layoutSourceHeight, canvas.width, canvas.height, options.settings.fitMode);

  context.save();
  if (artworkRotation === 90) {
    context.translate(fitted.xOffset + fitted.width, fitted.yOffset);
    context.rotate(Math.PI / 2);
    context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, fitted.height, fitted.width);
  } else if (artworkRotation === 180) {
    context.translate(fitted.xOffset + fitted.width, fitted.yOffset + fitted.height);
    context.rotate(Math.PI);
    context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, fitted.width, fitted.height);
  } else if (artworkRotation === 270) {
    context.translate(fitted.xOffset, fitted.yOffset + fitted.height);
    context.rotate((Math.PI * 3) / 2);
    context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, fitted.height, fitted.width);
  } else {
    context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, fitted.xOffset, fitted.yOffset, fitted.width, fitted.height);
  }
  context.restore();

  return canvas.toDataURL("image/png");
}


async function createBookletImposedPdf(options: {
  file: File;
  previewDataUrl: string;
  pages?: Array<{ previewDataUrl: string; widthInches: number; heightInches: number }>;
  selectedPageIndex?: number;
  result: ImpositionResult;
  settings: ImpositionSettings;
}, sourceBytes: ArrayBuffer) {
  const { PDFDocument, rgb, degrees } = await import("pdf-lib");
  const sourcePdf = await PDFDocument.load(sourceBytes.slice(0));
  const sourcePages = sourcePdf.getPages();
  const actualPageCount = sourcePages.length;
  const paddedPageCount = Math.max(4, Math.ceil(actualPageCount / 4) * 4);
  const signatureCount = paddedPageCount / 4;
  const output = await PDFDocument.create();
  const artworkCrop =
    options.settings.artworkBoxMode === "trim-marks"
      ? Math.max(0, options.settings.artworkCrop || 0) * POINTS_PER_INCH
      : 0;

  const embeddedPages = await Promise.all(
    sourcePages.map((sourcePage) => {
      const sourceWidth = sourcePage.getWidth();
      const sourceHeight = sourcePage.getHeight();
      const safeCrop = Math.min(artworkCrop, Math.max(0, sourceWidth / 2 - 1), Math.max(0, sourceHeight / 2 - 1));
      return output.embedPage(
        sourcePage,
        safeCrop > 0
          ? { left: safeCrop, bottom: safeCrop, right: sourceWidth - safeCrop, top: sourceHeight - safeCrop }
          : undefined
      );
    })
  );

  const sheetWidth = options.result.sheetWidth * POINTS_PER_INCH;
  const sheetHeight = options.result.sheetHeight * POINTS_PER_INCH;
  const cellWidth = options.result.pieceWidth * POINTS_PER_INCH;
  const cellHeight = options.result.pieceHeight * POINTS_PER_INCH;
  const gutter = Math.max(0, options.settings.gutter) * POINTS_PER_INCH;
  const layoutLeft = options.result.layoutLeft * POINTS_PER_INCH;
  const layoutTop = options.result.layoutTop * POINTS_PER_INCH;
  const columns = Math.max(2, options.result.columns - (options.result.columns % 2));
  const rows = Math.max(1, options.result.rows);
  const artworkRotation = normalizeRotation(options.result.artworkRotation ?? (options.result.artworkRotated ? 90 : 0));
  const cutColor = rgb(0.06, 0.14, 0.28);
  const markLength = Math.max(0, options.settings.cropMarkLength || 0) * POINTS_PER_INCH;
  const markOffset = Math.max(0, options.settings.cropMarkOffset || 0) * POINTS_PER_INCH;

  function sourcePageNumber(signatureIndex: number, back: boolean, right: boolean) {
    const direction = options.settings.bookletReadingDirection ?? "ltr";
    if (direction === "rtl") {
      if (!back) return right ? paddedPageCount - signatureIndex * 2 : 1 + signatureIndex * 2;
      return right ? 2 + signatureIndex * 2 : paddedPageCount - 1 - signatureIndex * 2;
    }
    if (!back) return right ? 1 + signatureIndex * 2 : paddedPageCount - signatureIndex * 2;
    return right ? paddedPageCount - 1 - signatureIndex * 2 : 2 + signatureIndex * 2;
  }

  function drawEmbedded(targetPage: ReturnType<typeof output.addPage>, pageNumber: number, x: number, y: number) {
    if (pageNumber < 1 || pageNumber > actualPageCount) return;
    const embedded = embeddedPages[pageNumber - 1];
    if (!embedded) return;
    const quarterTurn = isQuarterTurn(artworkRotation);
    const sourceWidth = quarterTurn ? embedded.height : embedded.width;
    const sourceHeight = quarterTurn ? embedded.width : embedded.height;
    const fitted = fitRect(sourceWidth, sourceHeight, cellWidth, cellHeight, options.settings.fitMode);
    if (artworkRotation === 90) {
      targetPage.drawPage(embedded, { x: x + fitted.xOffset + fitted.width, y: y + fitted.yOffset, width: fitted.height, height: fitted.width, rotate: degrees(90) });
    } else if (artworkRotation === 180) {
      targetPage.drawPage(embedded, { x: x + fitted.xOffset + fitted.width, y: y + fitted.yOffset + fitted.height, width: fitted.width, height: fitted.height, rotate: degrees(180) });
    } else if (artworkRotation === 270) {
      targetPage.drawPage(embedded, { x: x + fitted.xOffset, y: y + fitted.yOffset + fitted.height, width: fitted.height, height: fitted.width, rotate: degrees(270) });
    } else {
      targetPage.drawPage(embedded, { x: x + fitted.xOffset, y: y + fitted.yOffset, width: fitted.width, height: fitted.height });
    }
  }

  function drawCornerMarks(targetPage: ReturnType<typeof output.addPage>, x: number, y: number) {
    if (!options.settings.showCornerMarks || markLength <= 0) return;
    const starts = [
      [{ x: x - markOffset - markLength, y }, { x: x - markOffset, y }],
      [{ x: x + cellWidth + markOffset, y }, { x: x + cellWidth + markOffset + markLength, y }],
      [{ x: x - markOffset - markLength, y: y + cellHeight }, { x: x - markOffset, y: y + cellHeight }],
      [{ x: x + cellWidth + markOffset, y: y + cellHeight }, { x: x + cellWidth + markOffset + markLength, y: y + cellHeight }],
      [{ x, y: y - markOffset - markLength }, { x, y: y - markOffset }],
      [{ x, y: y + cellHeight + markOffset }, { x, y: y + cellHeight + markOffset + markLength }],
      [{ x: x + cellWidth, y: y - markOffset - markLength }, { x: x + cellWidth, y: y - markOffset }],
      [{ x: x + cellWidth, y: y + cellHeight + markOffset }, { x: x + cellWidth, y: y + cellHeight + markOffset + markLength }]
    ] as const;
    for (const [start, end] of starts) targetPage.drawLine({ start, end, color: cutColor, thickness: 0.45 });
  }

  for (let signatureIndex = 0; signatureIndex < signatureCount; signatureIndex += 1) {
    for (const back of [false, true]) {
      const targetPage = output.addPage([sheetWidth, sheetHeight]);
      for (let row = 0; row < rows; row += 1) {
        for (let column = 0; column < columns; column += 1) {
          const x = layoutLeft + column * (cellWidth + gutter);
          const yFromTop = layoutTop + row * (cellHeight + gutter);
          const y = sheetHeight - yFromTop - cellHeight;
          const right = column % 2 === 1;
          drawEmbedded(targetPage, sourcePageNumber(signatureIndex, back, right), x, y);
          drawCornerMarks(targetPage, x, y);
        }
      }

      if (options.settings.showFoldMarks && markLength > 0) {
        for (let pairStart = 0; pairStart < columns; pairStart += 2) {
          const foldX = layoutLeft + pairStart * (cellWidth + gutter) + cellWidth + gutter / 2;
          const topY = sheetHeight - layoutTop;
          const bottomY = sheetHeight - (layoutTop + rows * cellHeight + Math.max(0, rows - 1) * gutter);
          targetPage.drawLine({ start: { x: foldX, y: topY + markOffset }, end: { x: foldX, y: topY + markOffset + markLength }, color: cutColor, thickness: 0.55 });
          targetPage.drawLine({ start: { x: foldX, y: bottomY - markOffset }, end: { x: foldX, y: bottomY - markOffset - markLength }, color: cutColor, thickness: 0.55 });
        }
      }
    }
  }

  return output.save();
}

export async function createImposedPdf(options: {
  file: File;
  previewDataUrl: string;
  pages?: Array<{ previewDataUrl: string; widthInches: number; heightInches: number }>;
  selectedPageIndex?: number;
  result: ImpositionResult;
  settings: ImpositionSettings;
}) {
  const { PDFDocument, rgb, degrees, pushGraphicsState, popGraphicsState, rectangle, clip, endPath, concatTransformationMatrix } = await import("pdf-lib");
  function colorFromHex(hex: string) {
    const clean = hex.replace("#", "").trim();
    const normalized = clean.length === 3 ? clean.split("").map((character) => character + character).join("") : clean.padEnd(6, "f").slice(0, 6);
    const value = Number.parseInt(normalized, 16);
    if (Number.isNaN(value)) return rgb(1, 1, 1);
    return rgb(((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255);
  }

  const bytes = await options.file.arrayBuffer();
  const isPdf = options.file.type === "application/pdf" || options.file.name.toLowerCase().endsWith(".pdf");
  if (options.settings.mode === "booklet" && isPdf) {
    return createBookletImposedPdf(options, bytes);
  }
  const output = await PDFDocument.create();
  const page = output.addPage([
    options.result.sheetWidth * POINTS_PER_INCH,
    options.result.sheetHeight * POINTS_PER_INCH
  ]);
  const cellWidth = options.result.pieceWidth * POINTS_PER_INCH;
  const cellHeight = options.result.pieceHeight * POINTS_PER_INCH;
  const margin = options.settings.margin * POINTS_PER_INCH;
  const gutter = options.settings.gutter * POINTS_PER_INCH;
  const bleed = (options.settings.imageBleedEnabled ? options.settings.bleed : 0) * POINTS_PER_INCH;
  const layoutLeft = options.result.layoutLeft * POINTS_PER_INCH;
  const layoutTop = options.result.layoutTop * POINTS_PER_INCH;
  const sheetHeight = options.result.sheetHeight * POINTS_PER_INCH;
  const sheetWidth = options.result.sheetWidth * POINTS_PER_INCH;
  const artBoxes: Array<{ x: number; y: number; width: number; height: number }> = [];
  const artworkRotation = normalizeRotation(options.result.artworkRotation ?? (options.result.artworkRotated ? 90 : 0));
  const artworkRotated = isQuarterTurn(artworkRotation);
  const cropMarkLength = Math.max(0, options.settings.cropMarkLength || 0) * POINTS_PER_INCH;
  const cropMarkOffset = Math.max(0, options.settings.cropMarkOffset || 0) * POINTS_PER_INCH;
  const duplicationEdgeSample = 0.03 * POINTS_PER_INCH;
  const useAllSourcePages = options.settings.mode === "repeat-all-pages" || options.settings.mode === "join-pages";
  const artworkCrop =
    options.settings.artworkBoxMode === "trim-marks"
      ? Math.max(0, options.settings.artworkCrop || 0) * POINTS_PER_INCH
      : 0;

  type ClipBox = { x: number; y: number; width: number; height: number };
  type DrawTransform = { mirrorX?: number; mirrorY?: number };
  let drawArtwork: (x: number, y: number, width: number, height: number, index: number, fitMode?: ImpositionSettings["fitMode"], clipBox?: ClipBox, transform?: DrawTransform) => void;

  function drawClipped(x: number, y: number, width: number, height: number, draw: () => void) {
    page.pushOperators(pushGraphicsState(), rectangle(x, y, width, height), clip(), endPath());
    draw();
    page.pushOperators(popGraphicsState());
  }

  function drawWithTransform(transform: DrawTransform | undefined, draw: () => void) {
    if (!transform?.mirrorX && !transform?.mirrorY) {
      draw();
      return;
    }

    const scaleX = transform.mirrorX ? -1 : 1;
    const scaleY = transform.mirrorY ? -1 : 1;
    const translateX = transform.mirrorX ? transform.mirrorX * 2 : 0;
    const translateY = transform.mirrorY ? transform.mirrorY * 2 : 0;
    page.pushOperators(pushGraphicsState(), concatTransformationMatrix(scaleX, 0, 0, scaleY, translateX, translateY));
    draw();
    page.pushOperators(popGraphicsState());
  }

  if (isPdf) {
    const sourcePdf = await PDFDocument.load(bytes);
    const sourcePages = sourcePdf.getPages();
    const pageCount = Math.max(1, Math.min(options.pages?.length ?? sourcePages.length, sourcePages.length));
    const pageIndices =
      useAllSourcePages
        ? Array.from({ length: pageCount }, (_, index) => index)
        : [0];
    const embeddedPages = await Promise.all(
      pageIndices.map((pageIndex) => {
        const sourcePage = sourcePages[pageIndex] ?? sourcePages[0];
        const sourceWidth = sourcePage.getWidth();
        const sourceHeight = sourcePage.getHeight();
        const safeCrop = Math.min(artworkCrop, Math.max(0, sourceWidth / 2 - 1), Math.max(0, sourceHeight / 2 - 1));
        return output.embedPage(
          sourcePage,
          safeCrop > 0
            ? {
                left: safeCrop,
                bottom: safeCrop,
                right: sourceWidth - safeCrop,
                top: sourceHeight - safeCrop
              }
            : undefined
        );
      })
    );
    drawArtwork = (x, y, width, height, index, fitMode = options.settings.fitMode, clipBox, transform) => {
      const embeddedPage =
        useAllSourcePages
          ? embeddedPages[index % embeddedPages.length]
          : embeddedPages[0];
      const sourceWidth = artworkRotated ? embeddedPage.height : embeddedPage.width;
      const sourceHeight = artworkRotated ? embeddedPage.width : embeddedPage.height;
      const fitted = fitRect(sourceWidth, sourceHeight, width, height, fitMode);
      const clipTarget = clipBox ?? { x, y, width, height };
      drawClipped(clipTarget.x, clipTarget.y, clipTarget.width, clipTarget.height, () => drawWithTransform(transform, () => {
        if (artworkRotation === 90) {
          page.drawPage(embeddedPage, {
            x: x + fitted.xOffset + fitted.width,
            y: y + fitted.yOffset,
            width: fitted.height,
            height: fitted.width,
            rotate: degrees(90)
          });
        } else if (artworkRotation === 180) {
          page.drawPage(embeddedPage, {
            x: x + fitted.xOffset + fitted.width,
            y: y + fitted.yOffset + fitted.height,
            width: fitted.width,
            height: fitted.height,
            rotate: degrees(180)
          });
        } else if (artworkRotation === 270) {
          page.drawPage(embeddedPage, {
            x: x + fitted.xOffset,
            y: y + fitted.yOffset + fitted.height,
            width: fitted.height,
            height: fitted.width,
            rotate: degrees(270)
          });
        } else {
          page.drawPage(embeddedPage, {
            x: x + fitted.xOffset,
            y: y + fitted.yOffset,
            width: fitted.width,
            height: fitted.height
          });
        }
      }));
    };
  } else {
    const isJpg = options.file.type === "image/jpeg" || options.file.name.toLowerCase().match(/\.jpe?g$/);
    const image = isJpg ? await output.embedJpg(bytes) : await output.embedPng(bytes);
    const dimensions = await getImageDimensions(options.previewDataUrl);
    const imagePage = options.pages?.[0];
    const cropPixelsX =
      options.settings.artworkBoxMode === "trim-marks" && imagePage?.widthInches
        ? options.settings.artworkCrop * (dimensions.width / imagePage.widthInches)
        : 0;
    const cropPixelsY =
      options.settings.artworkBoxMode === "trim-marks" && imagePage?.heightInches
        ? options.settings.artworkCrop * (dimensions.height / imagePage.heightInches)
        : 0;
    drawArtwork = (x, y, width, height, _index, fitMode = options.settings.fitMode, clipBox, transform) => {
      const sourceWidth = Math.max(1, dimensions.width - cropPixelsX * 2);
      const sourceHeight = Math.max(1, dimensions.height - cropPixelsY * 2);
      const layoutSourceWidth = artworkRotated ? sourceHeight : sourceWidth;
      const layoutSourceHeight = artworkRotated ? sourceWidth : sourceHeight;
      const fitted = fitRect(layoutSourceWidth, layoutSourceHeight, width, height, fitMode);
      const clipTarget = clipBox ?? { x, y, width, height };
      drawClipped(clipTarget.x, clipTarget.y, clipTarget.width, clipTarget.height, () => drawWithTransform(transform, () => {
        if (artworkRotation === 90) {
          const scaleX = fitted.width / sourceHeight;
          const scaleY = fitted.height / sourceWidth;
          page.drawImage(image, {
            x: x + fitted.xOffset + fitted.width + cropPixelsY * scaleX,
            y: y + fitted.yOffset - cropPixelsX * scaleY,
            width: dimensions.width * scaleY,
            height: dimensions.height * scaleX,
            rotate: degrees(90)
          });
        } else if (artworkRotation === 180) {
          const scaleX = fitted.width / sourceWidth;
          const scaleY = fitted.height / sourceHeight;
          page.drawImage(image, {
            x: x + fitted.xOffset + fitted.width + cropPixelsX * scaleX,
            y: y + fitted.yOffset + fitted.height + cropPixelsY * scaleY,
            width: dimensions.width * scaleX,
            height: dimensions.height * scaleY,
            rotate: degrees(180)
          });
        } else if (artworkRotation === 270) {
          const scaleX = fitted.width / sourceHeight;
          const scaleY = fitted.height / sourceWidth;
          page.drawImage(image, {
            x: x + fitted.xOffset - cropPixelsY * scaleX,
            y: y + fitted.yOffset + fitted.height + cropPixelsX * scaleY,
            width: dimensions.width * scaleY,
            height: dimensions.height * scaleX,
            rotate: degrees(270)
          });
        } else {
          const scaleX = fitted.width / sourceWidth;
          const scaleY = fitted.height / sourceHeight;
          page.drawImage(image, {
            x: x + fitted.xOffset - cropPixelsX * scaleX,
            y: y + fitted.yOffset - cropPixelsY * scaleY,
            width: dimensions.width * scaleX,
            height: dimensions.height * scaleY
          });
        }
      }));
    };
  }

  const duplicationSourcePages =
    options.pages?.length
      ? useAllSourcePages
        ? options.pages
        : [options.pages[0]]
      : [{
          previewDataUrl: options.previewDataUrl,
          widthInches: options.result.pieceWidth,
          heightInches: options.result.pieceHeight
        }];
  const duplicationArtworkImages =
    bleed > 0 && options.settings.bleedType === "duplication"
      ? await Promise.all(
          duplicationSourcePages.map(async (sourcePage) => {
            const finalPieceDataUrl = await renderFinalPieceDataUrl({
              previewDataUrl: sourcePage.previewDataUrl,
              widthInches: sourcePage.widthInches,
              heightInches: sourcePage.heightInches,
              result: options.result,
              settings: options.settings
            });
            return output.embedPng(dataUrlToBytes(finalPieceDataUrl));
          })
        )
      : [];

  function drawDuplicationArtwork(x: number, y: number, width: number, height: number, index: number, clipBox: ClipBox) {
    const duplicationImage =
      useAllSourcePages
        ? duplicationArtworkImages[index % duplicationArtworkImages.length]
        : duplicationArtworkImages[0];
    if (!duplicationImage) return;
    drawClipped(clipBox.x, clipBox.y, clipBox.width, clipBox.height, () => {
      page.drawImage(duplicationImage, { x, y, width, height });
    });
  }

  for (let row = 0; row < options.result.rows; row += 1) {
    for (let column = 0; column < options.result.columns; column += 1) {
      const x = layoutLeft + column * (cellWidth + gutter);
      const yFromTop = layoutTop + row * (cellHeight + gutter);
      const y = sheetHeight - yFromTop - cellHeight;
      const index = row * options.result.columns + column;
      if (bleed > 0) {
        const insideBleed = Math.max(0, Math.min(bleed, gutter / 2));
        const leftSideBleed = column === 0 ? bleed : insideBleed;
        const rightSideBleed = column === options.result.columns - 1 ? bleed : insideBleed;
        const topSideBleed = row === 0 ? bleed : insideBleed;
        const bottomSideBleed = row === options.result.rows - 1 ? bleed : insideBleed;
        const bleedX = Math.max(0, x - leftSideBleed);
        const bleedY = Math.max(0, y - bottomSideBleed);
        const bleedRight = Math.min(sheetWidth, x + cellWidth + rightSideBleed);
        const bleedTop = Math.min(sheetHeight, y + cellHeight + topSideBleed);
        const leftBleed = x - bleedX;
        const rightBleed = bleedRight - x - cellWidth;
        const topBleed = bleedTop - y - cellHeight;
        const bottomBleed = y - bleedY;
        const sampleX = Math.max(0.01, Math.min(duplicationEdgeSample, cellWidth / 20));
        const sampleY = Math.max(0.01, Math.min(duplicationEdgeSample, cellHeight / 20));
        const stretchWidth = (bleedAmount: number) => cellWidth * (bleedAmount / Math.min(sampleX, Math.max(0.01, bleedAmount)));
        const stretchHeight = (bleedAmount: number) => cellHeight * (bleedAmount / Math.min(sampleY, Math.max(0.01, bleedAmount)));
        const leftStretchWidth = stretchWidth(leftBleed);
        const rightStretchWidth = stretchWidth(rightBleed);
        const topStretchHeight = stretchHeight(topBleed);
        const bottomStretchHeight = stretchHeight(bottomBleed);
        const duplicateBleedZones = [
          { clip: { x: bleedX, y, width: leftBleed, height: cellHeight }, source: { x: bleedX, y, width: leftStretchWidth, height: cellHeight } },
          { clip: { x: x + cellWidth, y, width: rightBleed, height: cellHeight }, source: { x: bleedRight - rightStretchWidth, y, width: rightStretchWidth, height: cellHeight } },
          { clip: { x, y: y + cellHeight, width: cellWidth, height: topBleed }, source: { x, y: bleedTop - topStretchHeight, width: cellWidth, height: topStretchHeight } },
          { clip: { x, y: bleedY, width: cellWidth, height: bottomBleed }, source: { x, y: bleedY, width: cellWidth, height: bottomStretchHeight } },
          { clip: { x: bleedX, y: y + cellHeight, width: leftBleed, height: topBleed }, source: { x: bleedX, y: bleedTop - topStretchHeight, width: leftStretchWidth, height: topStretchHeight } },
          { clip: { x: x + cellWidth, y: y + cellHeight, width: rightBleed, height: topBleed }, source: { x: bleedRight - rightStretchWidth, y: bleedTop - topStretchHeight, width: rightStretchWidth, height: topStretchHeight } },
          { clip: { x: bleedX, y: bleedY, width: leftBleed, height: bottomBleed }, source: { x: bleedX, y: bleedY, width: leftStretchWidth, height: bottomStretchHeight } },
          { clip: { x: x + cellWidth, y: bleedY, width: rightBleed, height: bottomBleed }, source: { x: bleedRight - rightStretchWidth, y: bleedY, width: rightStretchWidth, height: bottomStretchHeight } }
        ];
        const mirrorBleedZones = [
          { clip: { x: bleedX, y, width: leftBleed, height: cellHeight }, transform: { mirrorX: x } },
          { clip: { x: x + cellWidth, y, width: rightBleed, height: cellHeight }, transform: { mirrorX: x + cellWidth } },
          { clip: { x, y: y + cellHeight, width: cellWidth, height: topBleed }, transform: { mirrorY: y + cellHeight } },
          { clip: { x, y: bleedY, width: cellWidth, height: bottomBleed }, transform: { mirrorY: y } },
          { clip: { x: bleedX, y: y + cellHeight, width: leftBleed, height: topBleed }, transform: { mirrorX: x, mirrorY: y + cellHeight } },
          { clip: { x: x + cellWidth, y: y + cellHeight, width: rightBleed, height: topBleed }, transform: { mirrorX: x + cellWidth, mirrorY: y + cellHeight } },
          { clip: { x: bleedX, y: bleedY, width: leftBleed, height: bottomBleed }, transform: { mirrorX: x, mirrorY: y } },
          { clip: { x: x + cellWidth, y: bleedY, width: rightBleed, height: bottomBleed }, transform: { mirrorX: x + cellWidth, mirrorY: y } }
        ];
        const bleedZones = options.settings.bleedType === "mirror" ? mirrorBleedZones : duplicateBleedZones;
        for (const zone of bleedZones) {
          if (zone.clip.width > 0.01 && zone.clip.height > 0.01) {
            if (options.settings.bleedType === "color") {
              page.drawRectangle({
                x: zone.clip.x,
                y: zone.clip.y,
                width: zone.clip.width,
                height: zone.clip.height,
                color: colorFromHex(options.settings.bleedColor || "#ffffff")
              });
            } else {
              const source = "source" in zone ? zone.source : { x, y, width: cellWidth, height: cellHeight };
              const transform = "transform" in zone ? zone.transform : undefined;
              if (options.settings.bleedType === "duplication") {
                drawDuplicationArtwork(source.x, source.y, source.width, source.height, index, zone.clip);
              } else {
                drawArtwork(source.x, source.y, source.width, source.height, index, options.settings.fitMode, zone.clip, transform);
              }
            }
          }
        }
      }
      drawArtwork(x, y, cellWidth, cellHeight, index);
      artBoxes.push({ x, y, width: cellWidth, height: cellHeight });
    }
  }

  const cutColor = rgb(0.06, 0.14, 0.28);
  const bleedColor = rgb(0.85, 0.1, 0.1);
  const uniqueSorted = (values: number[]) =>
    [...values]
      .sort((a, b) => a - b)
      .filter((value, index, sorted) => index === 0 || Math.abs(value - sorted[index - 1]) > 0.5);

  function clampPoint(point: { x: number; y: number }) {
    return {
      x: Math.min(sheetWidth, Math.max(0, point.x)),
      y: Math.min(sheetHeight, Math.max(0, point.y))
    };
  }

  function drawCutLine(start: { x: number; y: number }, end: { x: number; y: number }) {
    page.drawLine({ start: clampPoint(start), end: clampPoint(end), color: cutColor, thickness: 0.45 });
  }

  const groupLeft = Math.min(...artBoxes.map((box) => box.x));
  const groupRight = Math.max(...artBoxes.map((box) => box.x + box.width));
  const groupBottom = Math.min(...artBoxes.map((box) => box.y));
  const groupTop = Math.max(...artBoxes.map((box) => box.y + box.height));
  const guideLeft = Math.max(0, groupLeft - bleed);
  const guideRight = Math.min(sheetWidth, groupRight + bleed);
  const guideBottom = Math.max(0, groupBottom - bleed);
  const guideTop = Math.min(sheetHeight, groupTop + bleed);

  if (options.settings.showBleedGuide && bleed > 0) {
    page.drawRectangle({
      x: guideLeft,
      y: guideBottom,
      width: guideRight - guideLeft,
      height: guideTop - guideBottom,
      borderColor: bleedColor,
      borderWidth: 0.35
    });
  }

  if (cropMarkLength > 0 && options.settings.showCornerMarks) {
    const verticalCutPositions = uniqueSorted(artBoxes.flatMap((box) => [box.x, box.x + box.width]));
    const horizontalCutPositions = uniqueSorted(artBoxes.flatMap((box) => [box.y, box.y + box.height]));
    const topStart = guideTop + cropMarkOffset;
    const bottomEnd = guideBottom - cropMarkOffset;
    const leftEnd = guideLeft - cropMarkOffset;
    const rightStart = guideRight + cropMarkOffset;

    for (const x of verticalCutPositions) {
      drawCutLine({ x, y: bottomEnd - cropMarkLength }, { x, y: bottomEnd });
      drawCutLine({ x, y: topStart }, { x, y: topStart + cropMarkLength });
    }

    for (const y of horizontalCutPositions) {
      drawCutLine({ x: leftEnd - cropMarkLength, y }, { x: leftEnd, y });
      drawCutLine({ x: rightStart, y }, { x: rightStart + cropMarkLength, y });
    }
  }

  if (options.settings.showRegistrationMarks && cropMarkLength > 0) {
    const centerX = sheetWidth / 2;
    const centerY = sheetHeight / 2;
    const mark = cropMarkLength * 0.75;
    drawCutLine({ x: centerX - mark, y: sheetHeight - margin / 2 }, { x: centerX + mark, y: sheetHeight - margin / 2 });
    drawCutLine({ x: centerX, y: sheetHeight - margin / 2 - mark }, { x: centerX, y: sheetHeight - margin / 2 + mark });
    drawCutLine({ x: centerX - mark, y: margin / 2 }, { x: centerX + mark, y: margin / 2 });
    drawCutLine({ x: centerX, y: margin / 2 - mark }, { x: centerX, y: margin / 2 + mark });
    drawCutLine({ x: margin / 2 - mark, y: centerY }, { x: margin / 2 + mark, y: centerY });
    drawCutLine({ x: margin / 2, y: centerY - mark }, { x: margin / 2, y: centerY + mark });
    drawCutLine({ x: sheetWidth - margin / 2 - mark, y: centerY }, { x: sheetWidth - margin / 2 + mark, y: centerY });
    drawCutLine({ x: sheetWidth - margin / 2, y: centerY - mark }, { x: sheetWidth - margin / 2, y: centerY + mark });
  }

  return output.save();
}
