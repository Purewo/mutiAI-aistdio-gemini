# ADR-0006: Product-owned external channel adapters

Status: Accepted for M4 implementation.

## Context

Nexwork will eventually receive platform-assistant messages from personal
WeChat, Feishu, WhatsApp, and other providers. Their transports, identities,
authorization, media protocols, and conversation features differ materially.
OpenClaw demonstrates that a useful common boundary is a capability-aware
channel plugin contract, not a universal provider API.

## Decision

Introduce a product-owned channel adapter boundary. The product owns the
connection, conversation binding, inbound journal, outbound outbox, delivery
attempts, and mapping to canonical `AssistantMessage` records. Each provider
implements its own connection, ingress, and egress behavior behind the boundary.

The first adapter is `weixin-ilink`, using Tencent's iLink QR and HTTP
long-poll protocol. The adapter is statically registered; a dynamic plugin
installer is deferred.

External channels route only to the existing platform assistant. They must not
implement organization, Task, Action, confirmation, feasibility, approval,
Artifact, or Runtime logic.

## Consequences

Positive:

- A second provider reuses product delivery, idempotency, audit, and assistant
  routing instead of duplicating it.
- Provider-specific features remain explicit through capabilities and do not
  leak into the canonical product model.
- One assistant message can be delivered to multiple channels with independent
  receipts and retries.
- Cursor/ack ordering and replay deduplication are product-owned and testable.

Costs:

- The first adapter requires additional persistent entities and an outbox.
- A real channel login still requires provider credentials and live network
  verification; protocol tests alone do not prove a connected account.
- Public connection APIs must remain versioned as provider setup details evolve.

## Rejected alternatives

### One universal `send(provider, payload)` API

Rejected because it hides authentication, addressing, threading, media, and
acknowledgement differences and would force the least capable platform's model
onto all channels.

### Copy OpenClaw's complete plugin SDK

Rejected for M4. OpenClaw's optional capability surface is much larger than the
Nexwork product needs. We adopt its separation of core and adapter concerns,
not its full gateway/plugin installation system.

### Put provider fields on `AssistantMessage`

Rejected because one canonical message may have multiple deliveries and a
provider may split one message into several platform messages. Provider state
belongs in channel mapping and delivery entities.

## Scope boundary

M4 includes direct Weixin text delivery, durable inbound/outbound records, QR
authorization state, explicit sender binding, and fake-adapter contract tests.
Incoming media is normalized to an explicit unsupported-content notice until a
separate media bridge is implemented and capability-tested. Group chat, rich
cards, reactions, provider-agnostic webhooks, dynamic plugin installation, and
additional Runtime providers remain deferred.
