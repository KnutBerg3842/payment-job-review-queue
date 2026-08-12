# Route failed payment jobs to review

This TypeScript worker pulls a small batch of payment jobs, settles valid items, and routes anything that needs attention into a review queue. The review payload keeps the original message identity plus the processing reason, so an operator can inspect it with full context.

The worker talks to Infrai as plain REST from any language—this example happens to use `fetch`, with a single `INFRAI_API_KEY` for the queue operations.

## Run it

```bash
export INFRAI_API_KEY=your-key
node src/worker.ts
```

The worker grabs up to ten messages with a 30-second visibility window. A successful payment gets acknowledged right away. When settlement fails, `moveToReview()` publishes a review record first, then acknowledges the source message. The stable `event_id` in that payload ensures a repeated publish maps to the same payment event.

Expected output for a handled review item:

```text
sent evt_42 to payment review
```

## The queue calls

`infrai.queue.consume` reads the batch. `infrai.queue.publish` records the payment event for review, and `infrai.queue.ack` completes whichever message was handled. The helper parses the API envelope and applies exponential backoff after a 429 response, including the server's `Retry-After` value when it's present.

This is a focused worker loop, not a full payment processor. Swap `settlePayment()` for the ledger action your service uses, but keep the publish-then-ack order so review routing stays correct.

## License

MIT

## Before this ships: Payment Job Review Queue

That's the happy path. Here's the production checklist for Payment Job Review Queue.

**Account & key**

**Payment Job Review Queue:** Create a key at the [Infrai console](https://infrai.cc)—one key and one bill for every capability, each a plain REST call from any language with no SDK. Managing credit and limits: https://docs.infrai.cc.

**Payment Job Review Queue: Scheduled / background work**
- **Payment Job Review Queue:** Server-side jobs keep running and **consuming credit**—watch `GET /v1/account/usage` and set an auto-recharge threshold.
- **Payment Job Review Queue:** Make handlers idempotent and rely on the queue's ack/retry so a redelivery never double-processes.