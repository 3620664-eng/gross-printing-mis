import type { Customer, EmailLog, EmailThread, Job } from "@/lib/types";
import { emailHeaderAddress, emailHeaderName } from "@/lib/email-business-classifier";

export type CommunicationIntent =
  | "pickup_delivery"
  | "job_status"
  | "invoice_total"
  | "artwork_received"
  | "proof"
  | "general_followup";

export type CommunicationLearningExample = {
  id: string;
  intent: CommunicationIntent;
  customerId?: string;
  senderEmail?: string;
  request: string;
  reply: string;
  sentAt: string;
};

export type CommunicationRecommendation = {
  intent: CommunicationIntent;
  label: string;
  confidence: number;
  source: "gross_printing_memory" | "trusted_business_fact" | "needs_ai";
  deterministicDraft?: string;
  examples: CommunicationLearningExample[];
  matchedCount: number;
  explanation: string;
};

export const GROSS_PRINTING_TRUSTED_FACTS = {
  companyName: "Gross Printing",
  pickupAddress: "6 Jackson Ave, Spring Valley, NY 10977",
  phone: "845-362-0664",
  email: "jobs@grossprinting.com"
} as const;

function normalizeText(value = "") {
  return value.replace(/\r\n/g, "\n").replace(/\s+/g, " ").trim().toLowerCase();
}

function safeExcerpt(value = "", max = 2_500) {
  return value
    .replace(/\b(?:password|passcode|pin|otp|one[- ]time\s+code|api[_ -]?key|secret|access[_ -]?token|refresh[_ -]?token|bearer)\b\s*(?:(?:is|[:=])\s*)?[^\s,;]+/gi, "[secret]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[email]")
    .replace(/https?:\/\/\S+/gi, "[link]")
    .replace(/\b(?:\+?1[\s.()-]*)?(?:\(?\d{3}\)?[\s.-]+)\d{3}[\s.-]+\d{4}\b/g, "[phone]")
    .trim()
    .slice(0, max);
}

export function communicationIntent(value = ""): CommunicationIntent {
  const text = normalizeText(value);
  if (/(where\s+can\s+i\s+pick|pick\s*(?:it|them|this)?\s*up|pickup|pick-up|can\s+you\s+deliver|get\s+it\s+delivered|delivery\s+address)/i.test(text)) return "pickup_delivery";
  if (/(is\s+(?:it|this|the\s+job|my\s+order)\s+ready|when\s+will\s+(?:it|this|the\s+job)|what(?:'s|\s+is)\s+the\s+status|status\s+update|any\s+update)/i.test(text)) return "job_status";
  if (/(what(?:'s|\s+is)\s+the\s+total|send\s+(?:me\s+)?(?:the\s+)?invoice|resend\s+(?:the\s+)?invoice|balance|amount\s+due)/i.test(text)) return "invoice_total";
  if (/(did\s+you\s+(?:receive|get)\s+(?:the\s+)?(?:file|artwork)|received\s+(?:the\s+)?(?:file|artwork)|artwork\s+received)/i.test(text)) return "artwork_received";
  if (/\b(proof|approve\s+proof|proof\s+ready|changes\s+to\s+proof)\b/i.test(text)) return "proof";
  return "general_followup";
}

export function communicationIntentLabel(intent: CommunicationIntent) {
  const labels: Record<CommunicationIntent, string> = {
    pickup_delivery: "Pickup / delivery question",
    job_status: "Existing job status",
    invoice_total: "Invoice / total question",
    artwork_received: "Artwork received question",
    proof: "Proof follow-up",
    general_followup: "Customer follow-up"
  };
  return labels[intent];
}

function latestInboundBefore(thread: EmailThread | undefined, before: string) {
  if (!thread) return undefined;
  const cutoff = new Date(before).getTime();
  return thread.messages
    .filter((message) => message.direction === "inbound" && new Date(message.sentAt).getTime() <= cutoff)
    .sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime())[0];
}

function tokenSet(value: string) {
  return new Set(normalizeText(value).split(/[^a-z0-9]+/).filter((token) => token.length >= 3));
}

function overlapScore(a: string, b: string) {
  const left = tokenSet(a);
  const right = tokenSet(b);
  if (!left.size || !right.size) return 0;
  let overlap = 0;
  left.forEach((token) => { if (right.has(token)) overlap += 1; });
  return overlap / Math.max(1, Math.min(left.size, right.size));
}

function greetingName(customer: Customer | undefined, thread: EmailThread) {
  if (customer?.contact?.trim()) return customer.contact.trim().split(/\s+/)[0];
  if (customer?.name?.trim()) return customer.name.trim();
  const latest = thread.messages.slice().reverse().find((message) => message.direction === "inbound");
  const sender = latest ? emailHeaderName(latest.from) : "";
  return sender && !sender.includes("@") ? sender.split(/\s+/)[0] : "";
}

function relatedJobForThread(thread: EmailThread, jobs: Job[]) {
  if (thread.jobId) return jobs.find((job) => job.id === thread.jobId);
  if (thread.customerId) {
    return jobs
      .filter((job) => job.customerId === thread.customerId && !job.archived && !job.deletedAt && job.status !== "Cancelled")
      .sort((a, b) => new Date(b.updatedAt || b.dueDate).getTime() - new Date(a.updatedAt || a.dueDate).getTime())[0];
  }
  return undefined;
}

function pickupDraft(thread: EmailThread, customer: Customer | undefined, job: Job | undefined) {
  const name = greetingName(customer, thread);
  const hello = name ? `Hi ${name},\n\n` : "";
  const statusSentence = job?.status === "Ready"
    ? `Your ${job.title} (${job.jobNumber}) is ready. `
    : "";
  return `${hello}${statusSentence}You can pick it up at Gross Printing, ${GROSS_PRINTING_TRUSTED_FACTS.pickupAddress}. If you prefer delivery, please send the delivery address and we’ll confirm the delivery details.\n\nThank you,\nGross Printing`;
}

function statusDraft(thread: EmailThread, customer: Customer | undefined, job: Job | undefined) {
  if (!job) return undefined;
  const name = greetingName(customer, thread);
  const hello = name ? `Hi ${name},\n\n` : "";
  if (job.status === "Ready") {
    return `${hello}Your ${job.title} (${job.jobNumber}) is ready for pickup at Gross Printing, ${GROSS_PRINTING_TRUSTED_FACTS.pickupAddress}.\n\nThank you,\nGross Printing`;
  }
  if (job.status === "Delivered") {
    return `${hello}Our system shows ${job.title} (${job.jobNumber}) as delivered. If you need anything else for this job, please let us know.\n\nThank you,\nGross Printing`;
  }
  return `${hello}Your ${job.title} (${job.jobNumber}) is currently in ${job.status}. We’ll keep you updated as it moves forward.\n\nThank you,\nGross Printing`;
}

export function buildCommunicationRecommendation(input: {
  thread: EmailThread;
  threads: EmailThread[];
  logs: EmailLog[];
  jobs: Job[];
  customers: Customer[];
}): CommunicationRecommendation {
  const latestInbound = input.thread.messages.slice().reverse().find((message) => message.direction === "inbound");
  const request = `${latestInbound?.subject ?? input.thread.subject}\n${latestInbound?.bodyText ?? input.thread.snippet}`;
  const intent = communicationIntent(request);
  const customer = input.thread.customerId ? input.customers.find((item) => item.id === input.thread.customerId) : undefined;
  const senderEmail = emailHeaderAddress(latestInbound?.from ?? "");
  const job = relatedJobForThread(input.thread, input.jobs);

  const examples = input.logs
    .filter((log) => (log.status === "Sent" || log.status === "Test Sent") && Boolean(log.body?.trim()) && Boolean(log.threadId))
    .map((log) => {
      const sourceThread = input.threads.find((thread) => thread.id === log.threadId);
      const sourceInbound = latestInboundBefore(sourceThread, log.createdAt);
      if (!sourceInbound) return undefined;
      const sourceRequest = `${sourceInbound.subject}\n${sourceInbound.bodyText}`;
      const exampleIntent = communicationIntent(sourceRequest);
      const example: CommunicationLearningExample & { score: number } = {
        id: log.id,
        intent: exampleIntent,
        customerId: log.customerId ?? sourceThread?.customerId,
        senderEmail: emailHeaderAddress(sourceInbound.from),
        request: safeExcerpt(sourceRequest),
        reply: safeExcerpt(log.body),
        sentAt: log.createdAt,
        score: 0
      };
      if (exampleIntent === intent) example.score += 0.55;
      if (example.customerId && input.thread.customerId && example.customerId === input.thread.customerId) example.score += 0.2;
      if (example.senderEmail && senderEmail && example.senderEmail === senderEmail) example.score += 0.15;
      example.score += Math.min(0.2, overlapScore(request, sourceRequest) * 0.2);
      return example;
    })
    .filter((item): item is CommunicationLearningExample & { score: number } => Boolean(item && item.score >= 0.45))
    .sort((a, b) => b.score - a.score || new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime())
    .slice(0, 6)
    .map(({ score: _score, ...item }) => item);

  if (intent === "pickup_delivery") {
    return {
      intent,
      label: communicationIntentLabel(intent),
      confidence: 0.98,
      source: "trusted_business_fact",
      deterministicDraft: pickupDraft(input.thread, customer, job),
      examples,
      matchedCount: examples.length,
      explanation: `Uses the trusted Gross Printing pickup address${examples.length ? ` plus ${examples.length} previously sent similar repl${examples.length === 1 ? "y" : "ies"}` : ""}. Staff approval is still required.`
    };
  }

  if (intent === "job_status") {
    const draft = statusDraft(input.thread, customer, job);
    if (draft) {
      return {
        intent,
        label: communicationIntentLabel(intent),
        confidence: 0.96,
        source: "gross_printing_memory",
        deterministicDraft: draft,
        examples,
        matchedCount: examples.length,
        explanation: `Uses the linked/recent job status from the MIS${examples.length ? ` and ${examples.length} prior approved repl${examples.length === 1 ? "y" : "ies"}` : ""}.`
      };
    }
  }

  return {
    intent,
    label: communicationIntentLabel(intent),
    confidence: examples.length >= 3 ? 0.9 : examples.length ? 0.72 : 0.48,
    source: examples.length >= 3 ? "gross_printing_memory" : "needs_ai",
    examples,
    matchedCount: examples.length,
    explanation: examples.length
      ? `Found ${examples.length} previously sent Gross Printing repl${examples.length === 1 ? "y" : "ies"} with similar context. AI can use them as approved examples without inventing business facts.`
      : "No strong approved reply pattern exists yet. AI can draft from the current conversation and trusted MIS facts, then learn from the reply you actually send."
  };
}
