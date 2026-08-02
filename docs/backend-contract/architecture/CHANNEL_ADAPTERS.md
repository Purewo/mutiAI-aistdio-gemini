# External channel adapter architecture

Status: Accepted for the first M4 implementation boundary.

Nexwork may receive and deliver platform-assistant messages through external
channels such as personal WeChat, Feishu, and WhatsApp. A channel is a
transport boundary, not a second product workflow. Organization proposal,
confirmation, Task, Action, feasibility, approval, Artifact, and Runtime
semantics remain owned by the existing platform-assistant and product services.

## Flow and ownership

```text
Provider-specific transport and authentication
        |
        v
Channel inbound adapter
        |
        v
Product channel journal and deduplication
        |
        v
Conversation binding -> PlatformAssistantService
        |
        v
Canonical AssistantMessage / AssistantAction / Task records
        |
        v
Product channel outbox and delivery attempts
        |
        v
Channel outbound adapter -> provider
```

The product database is authoritative for channel connections, bindings,
delivery state, and mappings to product messages. LangGraph and Codex receive
no provider credentials, raw provider transcripts, or provider-specific
workflow state.

## Conversation isolation and web continuation

Each external provider conversation keeps its own
`ChannelConversationBinding -> AssistantConversation` mapping. Channel peers,
providers, and web-native conversations are not collapsed into one shared
context. The authenticated web conversation catalog nevertheless projects the
owner's channel binding metadata, title, and last-message preview so the web
client can open and continue any owned Conversation.

Opening a channel-bound Conversation on the web does not rebind the external
route. A web-originated Turn stays on the web. An assistant reply enters the
channel outbox only when its `reply_to_message_id` traces to a completed
channel inbound delivery. This message-level lineage prevents a mutable
"last active channel" from redirecting a reply after the user changes
surfaces.

`AssistantConversation.conversation_id` is the continuity identity exposed to
clients. `runtime_thread_id` remains an optional, replaceable execution
binding and does not control channel isolation or delivery.

## What is unified

Every adapter participates in the same internal ports:

- `ChannelDescriptor`: stable provider key, connection modes, declared
  capabilities, and limits.
- `ChannelAdapter`: authorization, account health, and outbound delivery.
- `ChannelPollingInboundAdapter`: optional long-poll cursor transport. Webhook
  and socket providers will use the same normalized admission service through a
  provider-specific ingress route instead of implementing a fake poller.
- The product-owned channel service: event identity extraction, normalization
  admission, cursor advancement, and normalized receipts.

The normalized inbound envelope contains a provider event ID, external
conversation and sender IDs, occurrence time, portable content parts, optional
reply/thread references, and an opaque provider context. The opaque context is
persisted for the adapter but is never exposed to product workflow logic.

The normalized outbound intent contains a product message ID, target binding,
portable content parts, optional reply/thread intent, and a stable idempotency
key. A receipt may contain multiple provider message IDs because one logical
assistant message can be split into several platform messages.

## What remains adapter-owned

QR/OAuth/credential flows, webhook signatures, WebSocket or long-poll loops,
provider IDs, media encryption and upload, cards/buttons/reactions, thread
semantics, mention rules, rate limits, and provider retry behavior remain inside
the adapter. A capability profile lets the product choose a safe fallback or
report an unsupported presentation without assuming every platform supports the
same feature.

## Reliability contract

Inbound processing is at-least-once:

1. Verify and normalize the provider delivery.
2. Persist the raw identity and normalized envelope in the product journal.
3. Only then advance a provider cursor or acknowledge a webhook.
4. Bind the external conversation to an existing or newly created platform
   assistant conversation.
5. Submit the message with a deterministic idempotency key.
6. Mark the journal row complete only after product adoption.

Outbound processing is an outbox:

1. Persist a delivery intent before provider I/O.
2. Send with a stable idempotency key where the provider supports one.
3. Persist every attempt and the normalized receipt.
4. Retry only classified transient failures; retain permanent failures for
   operator or user-visible recovery.

The unique inbound identity is `(connection_id, provider_event_id)`. Reusing a
Codex Thread or assistant conversation is not an exactly-once guarantee.

## First implementation

M4 first implements the `weixin-ilink` adapter used by the Tencent iLink
protocol. The first slice supports personal direct-message text in both
directions. Incoming media is journaled as an explicit unsupported-content
notice; media download/decryption and outbound media are not claimed yet.
Group, card, reaction, and edit semantics remain unsupported until a later
capability decision. The adapter is registered statically in the application.
Dynamic package installation or a general OpenClaw-compatible plugin loader is
out of scope for this milestone.

WhatsApp must later choose an explicit transport adapter (`whatsapp-web` or
`whatsapp-cloud`) rather than assuming those protocols are interchangeable.
