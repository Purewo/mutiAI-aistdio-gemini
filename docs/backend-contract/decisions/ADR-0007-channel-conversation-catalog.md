# ADR-0007: Isolated channel conversations with web continuation

Status: Accepted for M4 implementation.

## Context

Nexwork users need to continue an external-channel conversation from the web
without collapsing unrelated WeChat, Feishu, WhatsApp, or web conversations
into one context. The web application also needs a small, authoritative
conversation catalog instead of inferring channel ownership from message text
or Runtime Thread IDs.

OpenClaw demonstrates that channel routing should resolve to a product-owned
session key before invoking a model Runtime. Nexwork already has the equivalent
product resource in `AssistantConversation` and the external route mapping in
`ChannelConversationBinding`.

## Decision

- Each external provider conversation remains bound to its own product-owned
  `AssistantConversation`. Different channel conversations are not merged
  automatically.
- The authenticated assistant conversation list includes every conversation
  owned by the user, including channel-bound conversations, together with a
  safe channel-binding projection, a display title, and a final-message
  preview.
- The web application may load and submit a new message to any listed active
  conversation. This continues the same product transcript without changing
  the external channel binding.
- Reply delivery follows the source-message lineage. An Assistant reply is
  written to a channel outbox only when it replies to a persisted channel
  inbound message. A web-originated Turn in a channel-bound conversation stays
  on the web.
- `AssistantConversation.conversation_id` is the public continuity identity.
  A Codex Thread ID is a replaceable Runtime binding and never selects a web or
  external delivery route.

## Consequences

Positive:

- A user can move to the web to inspect and continue a WeChat conversation
  without losing its product-visible context.
- Different channel peers and providers remain isolated, avoiding accidental
  context or reply-route crossover.
- Frontend clients receive product-owned labels and channel facts through the
  authoritative OpenAPI contract instead of guessing from opaque IDs.
- Losing or rotating a Codex Thread does not change conversation identity or
  channel ownership.

Costs:

- Conversation list reads perform product-owned summary and channel-binding
  projections in addition to loading the core Conversation rows.
- A channel-bound conversation may contain both channel-originated and
  web-originated messages; audit and delivery logic must retain message-level
  origin lineage.
- Concurrent submissions to one Conversation still require the existing
  single-active-Turn rule or a future product-owned queue.

## Deferred

This decision does not add frontend UI, automatic conversation merging,
cross-channel identity linking, group conversations, proactive delivery-route
switching, or OpenClaw-style channel docking. Long-running proactive delivery
preferences require a separate product decision; they must not use a mutable
"last active channel" heuristic.
