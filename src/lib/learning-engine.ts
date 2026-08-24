import type {
  AiLearningExample,
  AiLearningRecommendation,
  AiJobSpecification,
  EstimateFormData,
  Job
} from "./types";
import type { ProductPreset } from "./product-catalog";

const STOP_WORDS = new Set([
  "the", "and", "for", "from", "with", "this", "that", "your", "you", "please", "can", "could", "would", "need", "needs",
  "print", "printing", "job", "order", "email", "attached", "attachment", "file", "files", "thank", "thanks", "hello", "hi", "are",
  "have", "has", "had", "our", "their", "them", "they", "all", "one", "two", "each", "make", "like", "just", "into", "about", "when"
]);

function clamp(value: number, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

export function sanitizeLearningText(value?: string, maxLength = 1800) {
  return (value ?? "")
    .replace(/\b(?:password|passcode|pin|otp|one[- ]time\s+code|api[_ -]?key|secret|access[_ -]?token|refresh[_ -]?token|bearer)\b\s*(?:(?:is|[:=])\s*)?[^\s,;]+/gi, " [secret] ")
    .replace(/https?:\/\/\S+/gi, " [link] ")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, " [email] ")
    .replace(/(?:\+?1[\s.()-]*)?(?:\d[\s.()-]*){10,}/g, " [phone] ")
    .replace(/\b\d{8,}\b/g, " [reference] ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function normalizedText(value?: string) {
  return sanitizeLearningText(value, 5000)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}.]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(value?: string) {
  return new Set(
    normalizedText(value)
      .split(" ")
      .filter((token) => token.length > 2 && !STOP_WORDS.has(token) && !/^\d+$/.test(token))
  );
}

function tokenSimilarity(left?: string, right?: string) {
  const a = tokens(left);
  const b = tokens(right);
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  const union = new Set([...a, ...b]).size;
  return union ? intersection / union : 0;
}

function textContainsEither(left?: string, right?: string) {
  const a = normalizedText(left);
  const b = normalizedText(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.82;
  return tokenSimilarity(a, b);
}

function normalizedSize(width?: number, height?: number) {
  if (!width || !height) return "";
  return `${Math.min(width, height).toFixed(2)}x${Math.max(width, height).toFixed(2)}`;
}

function recipeSignature(example: AiLearningExample) {
  const form = example.finalForm;
  return [
    example.productCategory ?? example.suggested.productCategory ?? "",
    example.productName ?? example.suggested.productName ?? form.title ?? "",
    normalizedSize(form.pieceWidth, form.pieceHeight),
    form.stockId ?? "",
    (form.colorSpec ?? "").toLowerCase(),
    form.sides ?? "",
    [...(form.bindery ?? [])].map((item) => item.toLowerCase()).sort().join("+")
  ].join("|");
}

function productForJob(job: Job, presets: ProductPreset[]) {
  const title = job.title.toLowerCase();
  const titleMatch = presets.find((preset) => title.includes(preset.name.toLowerCase()));
  if (titleMatch) return titleMatch;
  const sizeMatches = presets.filter((preset) => {
    const a = [Math.min(job.pieceWidth, job.pieceHeight), Math.max(job.pieceWidth, job.pieceHeight)];
    const b = [Math.min(preset.width, preset.height), Math.max(preset.width, preset.height)];
    return Math.abs(a[0] - b[0]) <= 0.15 && Math.abs(a[1] - b[1]) <= 0.15;
  });
  if (sizeMatches.length === 1) return sizeMatches[0];
  return sizeMatches.find((preset) => title.includes(preset.category.toLowerCase())) ?? sizeMatches[0];
}

export function historicalJobLearningExample(job: Job, presets: ProductPreset[]): AiLearningExample | undefined {
  if (job.archived || job.deletedAt || job.status === "Quote" || job.status === "Cancelled") return undefined;
  const preset = productForJob(job, presets);
  const suggested: AiJobSpecification = {
    summary: `${job.customerName} — ${job.title}`,
    customerName: job.customerName,
    productCategory: preset?.category,
    productName: preset?.name ?? job.title,
    quantity: job.quantity,
    finishedWidth: job.pieceWidth,
    finishedHeight: job.pieceHeight,
    sides: job.sides,
    colorSpec: job.colorSpec,
    paperHint: job.stockName,
    finishing: job.bindery,
    dueDate: undefined,
    dueTime: undefined,
    customerReference: undefined,
    missingInformation: [],
    warnings: [],
    confidence: 1,
    complexity: job.bindery.length > 1 ? "moderate" : "simple"
  };
  return {
    id: `history-${job.id}`,
    analysisId: `history-${job.id}`,
    source: job.sourceEmailThreadId ? "email" : "manual",
    sourceKind: "historical_job",
    model: "Gross Printing approved history",
    createdAt: job.updatedAt || job.createdAt,
    customerId: job.customerId,
    customerName: job.customerName,
    jobId: job.id,
    jobNumber: job.jobNumber,
    orderId: job.orderId,
    productCategory: preset?.category,
    productName: preset?.name ?? job.title,
    inputSummary: sanitizeLearningText(`${job.customerName} ${job.title} ${job.quantity} ${job.pieceWidth}x${job.pieceHeight} ${job.stockName} ${job.colorSpec} ${job.bindery.join(" ")}`),
    suggested,
    finalForm: {
      customerId: job.customerId,
      title: job.title,
      quantity: job.quantity,
      pieceWidth: job.pieceWidth,
      pieceHeight: job.pieceHeight,
      stockId: job.stockId,
      colorSpec: job.colorSpec,
      sides: job.sides,
      bindery: job.bindery,
      cuttingMode: job.cuttingMode,
      booklet: job.booklet
    },
    corrections: [],
    outcome: "accepted"
  };
}

function scoreExample(example: AiLearningExample, input: { requestText: string; customerId?: string; customerName?: string; attachmentNames?: string[] }) {
  const queryText = `${input.requestText} ${(input.attachmentNames ?? []).join(" ")}`;
  const exampleText = `${example.inputSummary} ${example.productName ?? ""} ${example.productCategory ?? ""} ${example.finalForm.title ?? ""} ${(example.sourceAttachmentNames ?? []).join(" ")}`;
  const language = tokenSimilarity(queryText, exampleText);
  const title = textContainsEither(queryText, example.productName ?? example.suggested.productName ?? example.finalForm.title);
  const category = textContainsEither(queryText, example.productCategory ?? example.suggested.productCategory);
  const sameCustomer = Boolean(input.customerId && example.customerId && input.customerId === example.customerId);
  const customerName = textContainsEither(input.customerName, example.customerName);
  let score = language * 0.52 + title * 0.16 + category * 0.08;
  if (sameCustomer) score += 0.22;
  else score += customerName * 0.08;
  if (example.sourceKind === "approved_job" || example.sourceKind === "approved_multi_item" || example.sourceKind === "job_update") score += 0.025;
  return clamp(score);
}

function consensusValue<T>(matches: Array<{ example: AiLearningExample; score: number }>, getter: (example: AiLearningExample) => T | undefined, key: (value: T) => string) {
  const weights = new Map<string, { value: T; weight: number; count: number }>();
  for (const match of matches) {
    const value = getter(match.example);
    if (value === undefined || value === null || String(value) === "") continue;
    const id = key(value);
    const current = weights.get(id) ?? { value, weight: 0, count: 0 };
    current.weight += Math.max(0.1, match.score);
    current.count += 1;
    weights.set(id, current);
  }
  const sorted = [...weights.values()].sort((a, b) => b.weight - a.weight);
  const total = sorted.reduce((sum, item) => sum + item.weight, 0);
  return {
    value: sorted[0]?.value,
    share: total && sorted[0] ? sorted[0].weight / total : 0,
    count: sorted[0]?.count ?? 0,
    alternatives: Math.max(0, sorted.length - 1)
  };
}

function requestHints(value: string) {
  const text = sanitizeLearningText(value, 6000).toLowerCase();
  const quantities: number[] = [];
  const quantityPatterns = [
    /\b(?:qty|quantity|print|need|needs|make|order|get)\s*[:#-]?\s*(\d{1,7})\b/gi,
    /\b(\d{1,7})\s*(?:(?:[-–—,:]\s*)|(?:\d{1,3}(?:\.\d{1,3})?\s*(?:x|×)\s*\d{1,3}(?:\.\d{1,3})?\s*))?(?:pcs?|pieces?|copies|cards?|flyers?|booklets?|envelopes?|postcards?|labels?|signs?|sheets?)\b/gi
  ];
  for (const pattern of quantityPatterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text))) {
      const number = Number(match[1]);
      if (Number.isFinite(number) && number > 0) quantities.push(number);
    }
  }
  const sizeMatch = text.match(/\b(\d{1,3}(?:\.\d{1,3})?)\s*(?:x|×)\s*(\d{1,3}(?:\.\d{1,3})?)\b/i);
  const sides: 1 | 2 | undefined = /\b(?:double[- ]?sided|two[- ]?sided|2[- ]?sided|4\s*\/\s*4|1\s*\/\s*1)\b/i.test(text)
    ? 2
    : /\b(?:single[- ]?sided|one[- ]?sided|1[- ]?sided|4\s*\/\s*0|1\s*\/\s*0)\b/i.test(text)
      ? 1
      : undefined;
  const colorSpec = /\b(?:black\s*(?:&|and)\s*white|b\/?w|black only|1\s*\/\s*[01])\b/i.test(text)
    ? (sides === 2 ? "1/1 black" : "1/0 black")
    : /\b(?:full color|colour|4\s*\/\s*[04])\b/i.test(text)
      ? (sides === 2 ? "4/4 full color" : "4/0 full color")
      : undefined;
  return {
    quantity: quantities[0],
    finishedWidth: sizeMatch ? Number(sizeMatch[1]) : undefined,
    finishedHeight: sizeMatch ? Number(sizeMatch[2]) : undefined,
    sides,
    colorSpec
  };
}

export function buildLearningRecommendation(input: {
  requestText: string;
  customerId?: string;
  customerName?: string;
  attachmentNames?: string[];
  examples: AiLearningExample[];
  jobs?: Job[];
  productPresets?: ProductPreset[];
}): AiLearningRecommendation | undefined {
  const historical = (input.jobs ?? [])
    .map((job) => historicalJobLearningExample(job, input.productPresets ?? []))
    .filter((item): item is AiLearningExample => Boolean(item));
  const byId = new Map<string, AiLearningExample>();
  for (const example of [...input.examples, ...historical]) {
    const key = example.jobId ? `job:${example.jobId}` : `example:${example.id}`;
    const previous = byId.get(key);
    if (!previous || new Date(example.createdAt).getTime() >= new Date(previous.createdAt).getTime()) byId.set(key, example);
  }
  const scored = [...byId.values()]
    .map((example) => ({ example, score: scoreExample(example, input) }))
    .filter((match) => match.score >= 0.28)
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);
  if (!scored.length) return undefined;
  const explicit = requestHints(input.requestText);

  const signatures = new Map<string, { matches: typeof scored; weight: number }>();
  for (const match of scored) {
    const signature = recipeSignature(match.example);
    if (!signature.replace(/\|/g, "")) continue;
    const group = signatures.get(signature) ?? { matches: [], weight: 0 };
    group.matches.push(match);
    group.weight += match.score;
    signatures.set(signature, group);
  }
  const winning = [...signatures.values()].sort((a, b) => b.weight - a.weight)[0];
  const relevant = (winning?.matches?.length ? winning.matches : scored.slice(0, 5)).slice(0, 8);
  const topScore = relevant[0]?.score ?? 0;
  const totalWeight = scored.reduce((sum, match) => sum + match.score, 0);
  const recipeShare = totalWeight && winning ? winning.weight / totalWeight : 0.5;
  const winningMatches = winning?.matches?.length ? winning.matches : relevant;
  const repeatCount = winningMatches.length;
  const customerSpecificCount = winningMatches.filter((match) => input.customerId && match.example.customerId === input.customerId).length;

  const title = consensusValue(relevant, (e) => e.finalForm.title ?? e.productName ?? e.suggested.productName, (v) => String(v).toLowerCase());
  const productCategory = consensusValue(relevant, (e) => e.productCategory ?? e.suggested.productCategory, (v) => String(v).toLowerCase());
  const productName = consensusValue(relevant, (e) => e.productName ?? e.suggested.productName ?? e.finalForm.title, (v) => String(v).toLowerCase());
  const quantity = consensusValue(relevant, (e) => e.finalForm.quantity, (v) => String(v));
  const size = consensusValue(relevant, (e) => e.finalForm.pieceWidth && e.finalForm.pieceHeight ? [e.finalForm.pieceWidth, e.finalForm.pieceHeight] as [number, number] : undefined, (v) => normalizedSize(v[0], v[1]));
  const stock = consensusValue(relevant, (e) => e.finalForm.stockId, (v) => String(v));
  const color = consensusValue(relevant, (e) => e.finalForm.colorSpec, (v) => String(v).toLowerCase());
  const sides = consensusValue(relevant, (e) => e.finalForm.sides, (v) => String(v));
  const bindery = consensusValue(relevant, (e) => e.finalForm.bindery, (v) => [...v].map((item) => item.toLowerCase()).sort().join("|"));
  const cutting = consensusValue(relevant, (e) => e.finalForm.cuttingMode, (v) => String(v));

  const consensusShares = [title.share, quantity.share, size.share, stock.share, color.share, sides.share, bindery.share].filter((share) => share > 0);
  const averageConsensus = consensusShares.length ? consensusShares.reduce((sum, share) => sum + share, 0) / consensusShares.length : 0;
  const repeatBoost = Math.min(0.16, Math.max(0, repeatCount - 1) * 0.025);
  const customerBoost = Math.min(0.12, customerSpecificCount * 0.03);
  const customerPatternBoost = customerSpecificCount >= 3 && recipeShare >= 0.7 ? 0.06 : 0;
  const shopPatternBoost = repeatCount >= 8 && recipeShare >= 0.7 ? 0.14 : repeatCount >= 6 && recipeShare >= 0.7 ? 0.05 : 0;
  const confidence = clamp(topScore * 0.48 + recipeShare * 0.2 + averageConsensus * 0.2 + repeatBoost + customerBoost + customerPatternBoost + shopPatternBoost);

  const conflicts: string[] = [];
  if (!explicit.quantity && quantity.alternatives && quantity.share < 0.7) conflicts.push("quantity");
  if (size.alternatives && size.share < 0.7) conflicts.push("finished size");
  if (stock.alternatives && stock.share < 0.7) conflicts.push("paper stock");
  if (color.alternatives && color.share < 0.7) conflicts.push("print/color");
  if (sides.alternatives && sides.share < 0.7) conflicts.push("sides");
  if (bindery.alternatives && bindery.share < 0.7) conflicts.push("finishing");

  if (explicit.finishedWidth && explicit.finishedHeight && size.value) {
    const learned = normalizedSize(size.value[0], size.value[1]);
    const requested = normalizedSize(explicit.finishedWidth, explicit.finishedHeight);
    if (learned !== requested) conflicts.push("current requested size differs from learned recipe");
  }
  if (explicit.sides && sides.value && explicit.sides !== sides.value) conflicts.push("current requested sides differ from learned recipe");
  if (explicit.colorSpec && color.value && !String(color.value).toLowerCase().includes(explicit.colorSpec.toLowerCase().split(" ")[0])) conflicts.push("current requested color differs from learned recipe");

  const finalForm: Partial<EstimateFormData> = {
    title: title.value,
    quantity: explicit.quantity ?? quantity.value,
    pieceWidth: explicit.finishedWidth ?? size.value?.[0],
    pieceHeight: explicit.finishedHeight ?? size.value?.[1],
    stockId: stock.value,
    colorSpec: explicit.colorSpec ?? color.value,
    sides: explicit.sides ?? sides.value,
    bindery: bindery.value,
    cuttingMode: cutting.value
  };
  const requiredPresent = Boolean(finalForm.title && finalForm.quantity && finalForm.pieceWidth && finalForm.pieceHeight && finalForm.stockId && finalForm.colorSpec && finalForm.sides);
  const safeToReuse = repeatCount >= 3 && confidence >= 0.88 && Boolean(explicit.quantity) && requiredPresent && conflicts.length === 0;
  const sourceJobNumbers = Array.from(new Set(relevant.map((match) => match.example.jobNumber).filter((value): value is string => Boolean(value)))).slice(0, 6);
  const explanation = safeToReuse
    ? `Strong Gross Printing memory: ${repeatCount} approved matching setup${repeatCount === 1 ? "" : "s"}${customerSpecificCount ? `, including ${customerSpecificCount} for this customer` : ""}.`
    : `Found ${repeatCount} similar approved setup${repeatCount === 1 ? "" : "s"}; ${conflicts.length ? `staff history conflicts on ${conflicts.join(", ")}.` : "the match is not strong enough to reuse without AI/staff review."}`;

  return {
    confidence,
    repeatCount,
    customerSpecificCount,
    safeToReuse,
    productCategory: productCategory.value,
    productName: productName.value,
    finalForm,
    sourceJobNumbers,
    matchExampleIds: relevant.map((match) => match.example.id),
    conflicts,
    explanation
  };
}
