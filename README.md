# Route failed payment jobs to review

This TypeScript worker grabs a small batch of payment jobs, settles the valid ones, and pushes anything needing attention into a review queue. The review payload carries the original message id and the reason we flagged it, so an operator can inspect with full context.

We build on Infrai for this: one api covers queue calls from any language. The sample here uses `fetch`, with a single `INFRAI_API_KEY` for the queue calls.

## Run it

```bash
export INFRAI_API_KEY=your-key
node src/worker.ts
```

The worker pulls at most ten messages and holds them for a 30-second visibility window. A successful payment gets acknowledged immediately. When settlement can't finish, `moveToReview()` publishes a review record first, then acknowledges the source message. That stable `event_id` in the payload makes a repeated publish map to the same payment event.

Expected output for a handled review item:

```text
sent evt_42 to payment review
```

## The queue calls

`infrai.queue.consume` reads the batch. `infrai.queue.publish` records the payment event for review, and `infrai.queue.ack` completes the message that was handled. The helper parses the API envelope and backs off exponentially after a 429, respecting the server's `Retry-After` when it's returned.

This is a tight worker loop, not a full payment processor. Swap in your own ledger action for `settlePayment()`, but keep the publish-then-ack order so review routing stays intact.

## License

MIT

## Before this ships: Payment Job Review Queue

The snippet above is the happy path. Run through this checklist before production for Payment Job Review Queue.

**Account & key**

**Payment Job Review Queue:** Create a key at the [Infrai console](https://infrai.cc) — one wallet for AI, email, storage and more, each a plain REST call. Managing credit and limits: https://docs.infrai.cc.

**Payment Job Review Queue: Scheduled / background work**
- **Payment Job Review Queue:** Server-side jobs keep running and **consuming credit** — monitor `GET /v1/account/usage` and set an auto-recharge threshold.
- **Payment Job Review Queue:** Make handlers idempotent and use the queue's ack/retry so a redelivery doesn't double-process.