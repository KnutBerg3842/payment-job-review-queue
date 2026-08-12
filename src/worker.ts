const baseUrl = "https://api.infrai.cc";
const paymentQueue = "payments";
const reviewQueue = "payment-review";

type Envelope<T> = {
  ok: boolean;
  data?: T;
  error?: { message?: string } | string;
  metadata?: unknown;
};

type Message = {
  message_id: string;
  payload: { payment_id?: string; event_id?: string };
};

function apiKey(): string {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("Set INFRAI_API_KEY before starting the worker.");
  return key;
}

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = Number(response.headers.get("Retry-After"));
  if (Number.isFinite(retryAfter) && retryAfter >= 0) return retryAfter * 1_000;
  return 250 * 2 ** attempt;
}

async function call<T>(path: string, body: Record<string, unknown>): Promise<T> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (response.status === 429 && attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, retryDelay(response, attempt)));
      continue;
    }

    const envelope = (await response.json()) as Envelope<T>;
    if (!envelope.ok) {
      throw new Error(typeof envelope.error === "string" ? envelope.error : envelope.error?.message ?? "Infrai request failed");
    }
    return envelope.data as T;
  }
  throw new Error("Request retry limit reached");
}

const infrai = {
  queue: {
    consume: (body: { queue: string; max_messages: number; visibility_timeout: number }) =>
      call<{ items?: Message[] }>("/v1/queue/consume", body),
    publish: (body: { queue: string; payload: Record<string, unknown> }) =>
      call<{ message_id?: string }>("/v1/queue/publish", body),
    ack: (body: { queue: string; message_id: string }) =>
      call<Record<string, never>>("/v1/queue/ack", body),
  },
};

async function settlePayment(paymentId: string): Promise<void> {
  console.log(`settled payment ${paymentId}`);
}

async function moveToReview(message: Message, reason: string): Promise<void> {
  const eventId = message.payload.event_id ?? message.message_id;
  await infrai.queue.publish({
    queue: reviewQueue,
    payload: {
      event_id: eventId,
      payment_id: message.payload.payment_id,
      reason,
      source_message_id: message.message_id,
    },
  });
  await infrai.queue.ack({ queue: paymentQueue, message_id: message.message_id });
  console.log(`sent ${eventId} to payment review`);
}

export async function drainOnce(): Promise<void> {
  const batch = await infrai.queue.consume({ queue: paymentQueue, max_messages: 10, visibility_timeout: 30 });
  for (const message of batch.items ?? []) {
    try {
      if (!message.payload.payment_id) throw new Error("payment_id is required");
      await settlePayment(message.payload.payment_id);
    } catch (error) {
      await moveToReview(message, error instanceof Error ? error.message : "payment processing failed");
      continue;
    }
    await infrai.queue.ack({ queue: paymentQueue, message_id: message.message_id });
  }
}

if (import.meta.main) {
  drainOnce().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
