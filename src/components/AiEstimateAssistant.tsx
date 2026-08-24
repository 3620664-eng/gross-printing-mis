"use client";

import { AlertTriangle, BrainCircuit, CheckCircle2, LoaderCircle, Sparkles, WandSparkles, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { AiAnalysisMode, AiAnalysisResult, AiJobSpecification } from "@/lib/types";

type CatalogContext = {
  categories: string[];
  products: Array<{ id?: string; category?: string; name?: string; width?: number; height?: number; colorSpec?: string; sides?: number }>;
  papers: Array<{ id?: string; name?: string; width?: number; height?: number; kind?: string }>;
  finishing: string[];
};

interface AiEstimateAssistantProps {
  open: boolean;
  onClose: () => void;
  authToken?: string;
  requestText: string;
  onRequestTextChange: (value: string) => void;
  artworkName?: string;
  artworkMimeType?: string;
  artworkDataUrl?: string;
  artworkWidthInches?: number;
  artworkHeightInches?: number;
  artworkPageCount?: number;
  source: "manual" | "email" | "artwork" | "email_artwork";
  current: {
    customerName?: string;
    productCategory?: string;
    productName?: string;
    quantity?: number;
    finishedWidth?: number;
    finishedHeight?: number;
    sides?: number;
    colorSpec?: string;
    paperName?: string;
    dueDate?: string;
    dueTime?: string;
  };
  catalog: CatalogContext;
  result?: AiAnalysisResult;
  onResult: (result: AiAnalysisResult) => void;
  onApply: (specification: AiJobSpecification) => void;
  autoRunKey?: string;
}

function confidenceLabel(value: number) {
  if (value >= 0.86) return "High confidence";
  if (value >= 0.68) return "Review carefully";
  return "Low confidence";
}

function readableMode(mode: AiAnalysisResult["usedMode"]) {
  return mode === "advanced" ? "Advanced review" : "Basic review";
}

export function AiEstimateAssistant({
  open,
  onClose,
  authToken,
  requestText,
  onRequestTextChange,
  artworkName,
  artworkMimeType,
  artworkDataUrl,
  artworkWidthInches,
  artworkHeightInches,
  artworkPageCount,
  source,
  current,
  catalog,
  result,
  onResult,
  onApply,
  autoRunKey
}: AiEstimateAssistantProps) {
  const [mode, setMode] = useState<AiAnalysisMode>("auto");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [questionAnswers, setQuestionAnswers] = useState<Record<string, string>>({});
  const lastAutoRunRef = useRef<string | undefined>(undefined);
  const hasSource = Boolean(requestText.trim() || artworkName || artworkDataUrl);
  const fields = useMemo(() => {
    const spec = result?.specification;
    if (!spec) return [];
    return [
      ["Product", spec.productName || spec.productCategory],
      ["Quantity", spec.quantity?.toLocaleString()],
      ["Finished size", spec.finishedWidth && spec.finishedHeight ? `${spec.finishedWidth} x ${spec.finishedHeight}` : undefined],
      ["Print", spec.colorSpec],
      ["Sides", spec.sides ? `${spec.sides}` : undefined],
      ["Paper", spec.paperHint],
      ["Finishing", spec.finishing.length ? spec.finishing.join(", ") : undefined],
      ["Due", [spec.dueDate, spec.dueTime].filter(Boolean).join(" ") || undefined]
    ].filter((field): field is [string, string] => Boolean(field[1]));
  }, [result]);

  async function analyze() {
    if (!hasSource || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/ai/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
        },
        body: JSON.stringify({
          mode,
          source,
          requestText: [
            requestText.trim(),
            ...Object.entries(questionAnswers)
              .filter(([, answer]) => answer.trim())
              .map(([question, answer]) => `Staff clarification — ${question}\nAnswer: ${answer.trim()}`)
          ].filter(Boolean).join("\n\n"),
          artwork: artworkName || artworkDataUrl ? {
            name: artworkName,
            mimeType: artworkMimeType,
            dataUrl: artworkDataUrl,
            widthInches: artworkWidthInches,
            heightInches: artworkHeightInches,
            pageCount: artworkPageCount
          } : undefined,
          current,
          catalog
        })
      });
      const payload = (await response.json().catch(() => ({}))) as { result?: AiAnalysisResult; error?: string };
      if (!response.ok || !payload.result) throw new Error(payload.error || "The AI assistant could not analyze this request.");
      onResult(payload.result);
    } catch (analysisError) {
      setError(analysisError instanceof Error ? analysisError.message : "The AI assistant could not analyze this request.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!open || !autoRunKey || !hasSource || busy || result || lastAutoRunRef.current === autoRunKey) return;
    lastAutoRunRef.current = autoRunKey;
    void analyze();
  }, [autoRunKey, busy, hasSource, open, result]);

  useEffect(() => {
    if (!result) setQuestionAnswers({});
  }, [result?.id]);

  if (!open) return null;

  return (
    <div className="modal-backdrop ai-assistant-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="ai-assistant-modal" role="dialog" aria-modal="true" aria-labelledby="ai-assistant-title">
        <header className="ai-assistant-header">
          <div className="ai-assistant-heading">
            <span className="ai-assistant-mark"><Sparkles size={22} /></span>
            <div>
              <p>Gross Printing automation</p>
              <h2 id="ai-assistant-title">AI intake and artwork assistant</h2>
              <span>It extracts specifications. Your pricing engine remains the only price authority.</span>
            </div>
          </div>
          <button className="icon-only" type="button" onClick={onClose} aria-label="Close AI assistant"><X size={19} /></button>
        </header>

        <div className="ai-assistant-body">
          <section className="ai-source-panel">
            <div className="ai-panel-heading">
              <div>
                <strong>Customer request</strong>
                <span>Paste the email, notes, or wording exactly as received.</span>
              </div>
              {artworkName ? <span className="ai-artwork-chip"><WandSparkles size={15} />{artworkName}</span> : null}
            </div>
            <textarea
              value={requestText}
              onChange={(event) => onRequestTextChange(event.target.value)}
              placeholder="Example: Please print 2,500 double-sided 5.5 x 8.5 flyers on glossy paper, full color, folded once..."
            />
            <div className="ai-run-row">
              <label>
                Review level
                <select value={mode} onChange={(event) => setMode(event.target.value as AiAnalysisMode)}>
                  <option value="auto">Automatic — start fast, escalate when needed</option>
                  <option value="basic">Basic — lower cost for clear jobs</option>
                  <option value="advanced">Advanced — difficult or unclear work</option>
                </select>
              </label>
              <button className="primary-button ai-run-button" type="button" onClick={analyze} disabled={!hasSource || busy}>
                {busy ? <LoaderCircle className="spin" size={17} /> : <BrainCircuit size={17} />}
                {busy ? "Analyzing..." : result ? "Analyze again" : "Analyze request"}
              </button>
            </div>
            {!hasSource ? <div className="ai-inline-warning"><AlertTriangle size={16} />Add request text or attach artwork first.</div> : null}
            {error ? <div className="ai-inline-warning error"><AlertTriangle size={16} />{error}</div> : null}
          </section>

          <section className="ai-result-panel">
            {result ? (
              <>
                <div className="ai-result-top">
                  <div>
                    <p>{readableMode(result.usedMode)} · {result.model}</p>
                    <h3>{result.specification.summary}</h3>
                  </div>
                  <span className={`ai-confidence ${result.specification.confidence >= 0.86 ? "high" : result.specification.confidence >= 0.68 ? "medium" : "low"}`}>
                    {Math.round(result.specification.confidence * 100)}% · {confidenceLabel(result.specification.confidence)}
                  </span>
                </div>

                {(artworkName || artworkWidthInches || artworkHeightInches || artworkPageCount) ? (
                  <div className="ai-artwork-evidence">
                    <div className="ai-artwork-evidence-heading">
                      <div>
                        <strong>Artwork recognized first</strong>
                        <span>AI uses the actual file evidence before deciding what it still needs to ask.</span>
                      </div>
                    </div>
                    <div className="ai-artwork-evidence-grid">
                      {artworkName ? <div><span>File</span><strong>{artworkName}</strong></div> : null}
                      {artworkWidthInches && artworkHeightInches ? <div><span>Page size</span><strong>{artworkWidthInches} x {artworkHeightInches} in</strong></div> : null}
                      {artworkPageCount ? <div><span>Pages</span><strong>{artworkPageCount}</strong></div> : null}
                      <div><span>Recognized job</span><strong>{result.specification.productName || result.specification.productCategory || "Needs visual review"}</strong></div>
                    </div>
                    <p><b>Description:</b> {result.specification.summary}</p>
                  </div>
                ) : null}

                <div className="ai-extracted-grid">
                  {fields.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}
                  {!fields.length ? <p>No supported production fields were found yet.</p> : null}
                </div>

                {result.specification.missingInformation.length ? (
                  <div className="ai-question-box ai-question-answer-box">
                    <strong>Only questions AI still cannot determine</strong>
                    <span className="ai-question-help">If you know an answer, type it here. AI will re-check the same email and artwork with your answer.</span>
                    <div className="ai-question-answer-list">
                      {result.specification.missingInformation.map((question) => (
                        <label key={question}>
                          <span>{question}</span>
                          <input
                            value={questionAnswers[question] ?? ""}
                            onChange={(event) => setQuestionAnswers((current) => ({ ...current, [question]: event.target.value }))}
                            placeholder="I know the answer…"
                          />
                        </label>
                      ))}
                    </div>
                    <button className="secondary-button ai-answer-rerun" type="button" onClick={() => void analyze()} disabled={busy || !Object.values(questionAnswers).some((answer) => answer.trim())}>
                      {busy ? <LoaderCircle className="spin" size={16} /> : <BrainCircuit size={16} />}
                      Re-analyze with my answers
                    </button>
                  </div>
                ) : (
                  <div className="ai-ready-box"><CheckCircle2 size={17} /><span>No required specification questions were identified. Staff review is still required.</span></div>
                )}

                {result.specification.warnings.length ? (
                  <div className="ai-warning-box">
                    <strong>Warnings</strong>
                    <ul>{result.specification.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
                  </div>
                ) : null}

                <div className="ai-result-actions">
                  <div>
                    <strong>Nothing changes automatically.</strong>
                    <span>Apply the suggestions, then verify and correct the normal quote form.</span>
                  </div>
                  <button className="primary-button" type="button" onClick={() => onApply(result.specification)}>
                    <CheckCircle2 size={17} />
                    Apply supported fields
                  </button>
                </div>
              </>
            ) : (
              <div className="ai-empty-result">
                <BrainCircuit size={38} />
                <strong>Ready to review the request</strong>
                <span>The assistant will identify supported specifications, unanswered questions, and warnings. It will not set the selling price.</span>
              </div>
            )}
          </section>
        </div>
      </section>
    </div>
  );
}
