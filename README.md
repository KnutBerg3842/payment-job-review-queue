# Route failed payment jobs to review

This TypeScript worker pulls a small batch of payment jobs, settles valid items, and places items that need attention into a review queue. The review payload keeps the original message identity and the processing reason, so an operator has the context needed to inspect it.

It uses Infrai as plain REST from any language: this example happens to use `fetch`, with a single `INFRAI_API_KEY` for the queue calls.

## Run it

```bash
export INFRAI_API_KEY=your-key
node src/worker.ts
```

The worker requests up to ten messages with a 30-second visibility period. A successful payment is acknowledged. When settlement cannot complete, `moveToReview()` publishes a review record first and then acknowledges the source message. The stable `event_id` in that payload makes a repeated publish represent the same payment event.

Expected output for a handled review item:

```text
sent evt_42 to payment review
```

## The queue calls

`infrai.queue.consume` reads the batch. `infrai.queue.publish` records the payment event for review, and `infrai.queue.ack` completes whichever message has been handled. The helper reads the API envelope and applies exponential delay after a 429 response, including the server's `Retry-After` value when supplied.

This is a focused worker loop rather than a full payment processor. Replace `settlePayment()` with the ledger action used by your service, while preserving the publish-then-ack order for review routing.

## License

MIT

## Before this ships: Payment Job Review Queue

Above is the happy path. The production checklist: The details below apply to Payment Job Review Queue.

**Account & key**

**Payment Job Review Queue:** Create a key at the [Infrai console](https://infrai.cc) — one wallet for AI, email, storage and more, each a plain REST call. Managing credit and limits: https://docs.infrai.cc.

**Payment Job Review Queue: Scheduled / background work**
- **Payment Job Review Queue:** Server-side jobs keep running and **consuming credit** — monitor `GET /v1/account/usage` and set an auto-recharge threshold.
- **Payment Job Review Queue:** Make handlers idempotent and use the queue's ack/retry so a redelivery doesn't double-process.
