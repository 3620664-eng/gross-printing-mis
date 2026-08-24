import { NextRequest, NextResponse } from "next/server";
import { aiErrorResponse, requireAiUser } from "@/lib/ai-pricing-server";
import { GROSS_PRINTING_TRUSTED_FACTS } from "@/lib/communication-learning";
import { rejectCrossSiteMutation, rejectOversizedJson } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const BASIC_MODEL = process.env.OPENAI_BASIC_MODEL ?? "gpt-5-mini";

type RequestBody = {
  intent?: string;
  customerName?: string;
  currentMessage?: string;
  conversation?: Array<{ direction?: "inbound" | "outbound"; body?: string; subject?: string }>;
  job?: { jobNumber?: string; title?: string; status?: string };
  examples?: Array<{ request?: string; reply?: string }>;
};

type OpenAiPayload = {
  output_text?: string;
  output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  error?: { message?: string };
};

function clean(value: unknown, max = 6_000) {
  return String(value ?? "")
    .replace(/\b(?:password|passcode|pin|otp|one[- ]time\s+code|api[_ -]?key|secret|access[_ -]?token|refresh[_ -]?token|bearer)\b\s*(?:(?:is|[:=])\s*)?[^\s,;]+/gi, "[secret]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[email]")
    .replace(/https?:\/\/\S+/gi, "[link]")
    .trim()
    .slice(0, max);
}

function outputText(payload: OpenAiPayload) {
  if (payload.output_text?.trim()) return payload.output_text.trim();
  for (const item of payload.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && content.text?.trim()) return content.text.trim();
    }
  }
  return "";
}

export async function POST(request: NextRequest) {
  const crossSite = rejectCrossSiteMutation(request);
  if (crossSite) return crossSite;
  const oversized = rejectOversizedJson(request, 96 * 1024);
  if (oversized) return oversized;
  const auth = await requireAiUser(request);
  if (auth instanceof NextResponse) return auth;

  let body: RequestBody;
  try {
    body = await request.json() as RequestBody;
  } catch {
    return aiErrorResponse(new Error("Invalid communication-draft request."), 400);
  }
  if (!body.currentMessage?.trim()) return aiErrorResponse(new Error("A customer message is required."), 400);
  if (!OPENAI_API_KEY) return aiErrorResponse(new Error("OpenAI is not configured on the server."), 503);

  const context = {
    intent: clean(body.intent, 120),
    customerName: clean(body.customerName, 160),
    currentMessage: clean(body.currentMessage, 8_000),
    conversation: (body.conversation ?? []).slice(-30).map((item) => ({
      direction: item.direction,
      subject: clean(item.subject, 500),
      body: clean(item.body, 1_800)
    })),
    job: body.job ? {
      jobNumber: clean(body.job.jobNumber, 80),
      title: clean(body.job.title, 250),
      status: clean(body.job.status, 80)
    } : null,
    approvedExamples: (body.examples ?? []).slice(0, 6).map((item) => ({ request: clean(item.request, 2_000), reply: clean(item.reply, 2_000) })),
    trustedFacts: GROSS_PRINTING_TRUSTED_FACTS
  };

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: BASIC_MODEL,
        store: false,
        max_output_tokens: 700,
        input: [
          {
            role: "system",
            content: [{
              type: "input_text",
              text: `You draft short customer-service email replies for Gross Printing staff approval. Never send anything. Use only facts in the supplied MIS context and trustedFacts. Previously sent examples are style/pattern guidance, not authority for old prices, addresses, dates, job numbers, quantities, or statuses. Never invent a price, promise a delivery, claim a job is ready, or claim artwork/invoice status unless the current context explicitly supports it. If a needed fact is missing, ask a concise question instead. Keep the reply professional, warm, and short. Do not include analysis or explanations; output only the proposed email body.`
            }]
          },
          { role: "user", content: [{ type: "input_text", text: JSON.stringify(context) }] }
        ]
      }),
      cache: "no-store"
    });
    const payload = await response.json().catch(() => ({})) as OpenAiPayload;
    if (!response.ok) return aiErrorResponse(new Error(payload.error?.message ?? `OpenAI request failed (${response.status}).`), response.status === 429 ? 429 : 502);
    const draft = outputText(payload);
    if (!draft) return aiErrorResponse(new Error("OpenAI returned no reply draft."), 502);
    return NextResponse.json({ ok: true, draft, model: BASIC_MODEL });
  } catch (error) {
    return aiErrorResponse(error, 502);
  }
}
