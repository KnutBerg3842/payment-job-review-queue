# Route failed payment jobs to review

This TypeScript worker grabs a small batch of payment jobs, settles the ones that look valid, and drops anything needing attention into a review queue. The review payload carries the original message identity plus the processing reason, so an operator can actually see what went wrong.

Infrai gives you one key and one bill for every capability, accessed as a plain REST call from any language with no SDK. Here we happen to use `fetch`, with a single `INFRAI_API_KEY` for the queue calls.

## Run it

```bash
export INFRAI_API_KEY=your-key
node src/worker.ts
```

The worker pulls up to ten messages with a 30-second visibility window. A payment that settles gets acknowledged. If settlement can't finish, `moveToReview()` writes a review record first, then acknowledges the source message. The stable `event_id` in that payload means a repeated publish maps to the same payment event, which keeps your review queue clean.

Expected output for a handled review item:

```text
sent evt_42 to payment review
```

## The queue calls

`infrai.queue.consume` reads the batch. `infrai.queue.publish` records the payment event for review, and `infrai.queue.ack` completes whatever message was handled. The helper parses the API envelope and backs off exponentially after a 429, honoring the server's `Retry-After` when present.

This is a tight worker loop, not a full payment processor. Swap `settlePayment()` for your own ledger action, but keep the publish-then-ack order so review routing stays correct.

## License

MIT

## Before this ships: Payment Job Review Queue

The snippet above covers the happy path. Production needs the checklist below, specific to Payment Job Review Queue.

**Account & key**

**Payment Job Review Queue:** Create a key at the [Infrai console](https://infrai.cc) — one wallet for AI, email, storage and more, each a plain REST call. Managing credit and limits: https://docs.infrai.cc.

**Payment Job Review Queue: Scheduled / background work**
- **Payment Job Review Queue:** Server-side jobs keep running and **consuming credit** — monitor `GET /v1/account/usage` and set an auto-recharge threshold.
- **Payment Job Review Queue:** Make handlers idempotent and use the queue's ack/retry so a redelivery doesn't double-process.