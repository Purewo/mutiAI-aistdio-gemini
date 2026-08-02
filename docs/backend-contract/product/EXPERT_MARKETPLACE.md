# Nexwork Expert Marketplace boundary

Status: Product and architecture boundary for the current internal-alpha
version. Payment and public third-party publishing are explicitly deferred.

## Product purpose

The Expert Marketplace is Nexwork's catalog and trial surface for bounded AI
experts. It lets a user discover one expert, talk to that expert directly,
inspect whether the result is useful, and then ask the platform assistant to
compose that expert into an organization role.

An Expert is provider-neutral. The current catalog supports experts backed by
the native Codex Runtime and by Dify. Claude Code and other providers may be
added later through adapters without changing the catalog, conversation,
organization, or Task contracts.

The marketplace is an important future monetization surface, but the current
version proves usefulness and provider integration before introducing payment,
licensing, or revenue sharing.

The current experience is browser-first. Direct expert conversations do not
become external-channel conversations in this version; channel adapters remain
bound to the platform assistant unless a later decision expands that boundary.

## Current-version goals

The current version must support:

1. A user can browse and search an operator-curated catalog of active experts.
2. The catalog can contain native Codex-backed and Dify-backed ExpertVersions
   without exposing provider-specific creation or configuration controls.
3. A user can open an expert detail page with a product-owned capability
   summary, supported inputs and outputs, limits, provider class, and current
   availability.
4. A user can start a private, owner-scoped conversation with one selected
   expert and send supported text or attachments.
5. The conversation can display normalized results, errors, usage, and provider
   limitations without exposing credentials, internal prompts, endpoints, or
   provider workflow nodes.
6. The platform assistant can read the active expert catalog and use any
   eligible expert when proposing an OrganizationSpec. The user does not need
   to grant a second per-expert permission in this no-billing version.
7. A published organization pins the selected expert version and its
   provider-neutral execution binding. Updating a catalog listing does not
   silently change an already published organization.
8. A Task can dispatch a bounded Assignment to the selected expert through the
   existing provider-neutral role-execution boundary.

## Terms and ownership

The following concepts remain separate. A single provider may implement more
than one expert, and one expert may later have more than one provider binding.

| Concept | Product meaning | Owner |
| --- | --- | --- |
| Expert | Stable catalog identity, such as `business-card-extractor` | Nexwork control plane |
| ExpertVersion | Immutable capability, interaction, and provider compatibility snapshot | Nexwork control plane |
| CapabilitySummary | User- and assistant-readable statement of purpose, inputs, outputs, limits, and known failure boundaries | Nexwork control plane, with operator verification |
| RuntimeBinding | Concrete provider selection and operator-owned configuration used for execution | Nexwork control plane and Runtime adapter |
| ExpertConversation | Owner-scoped direct trial conversation pinned to one ExpertVersion | Nexwork conversation layer |
| Organization role | Formal responsibility in an OrganizationSpec, optionally sourced from an ExpertVersion | Nexwork organization layer |
| Entitlement | Future commercial permission to use an ExpertVersion or offer | Future billing layer, not RuntimeBinding |

The catalog must never be the source of truth for Task state, Artifact bytes,
provider credentials, or Runtime lifecycle. The product database remains the
source of truth for ownership, versions, conversations, Tasks, Assignments,
Artifacts, usage, and audit records.

## Expert catalog boundary

### Current catalog source

Current entries are operator-curated and provider-configured. They may use the
native Codex adapter or the Dify adapter. Users cannot publish arbitrary URLs,
Dify API keys, Python plugins, prompts, or Runtime commands into the catalog. A
catalog entry becomes selectable only after the operator has configured its
provider adapter, capability profile, and health or availability state.

The catalog may describe a Dify Workflow, but it exposes the expert's product
capability, not Dify's internal graph. Dify workflow nodes, Agent nodes, tools,
memory, and provider identifiers remain provider-owned details.

### Provider supply boundary

Dify connectivity is marketplace supply infrastructure, not an ordinary-user
integration surface. The platform operator may configure multiple Dify
applications on one server or across multiple servers. Each application can
back a separately verified ExpertVersion, and the provider-neutral adapter may
route them by an operator-owned binding key.

Ordinary users and the platform assistant cannot create or modify a provider
connection. No user-facing API or UI may accept a Dify base URL, API key,
Workflow identifier, application secret, input variable, output variable, or
other provider configuration. A user-created RuntimeBinding does not onboard a
provider connection or publish an ExpertVersion. Users can discover, test, and
compose only active ExpertVersions already admitted to the operator-curated
catalog.

Provider credentials remain in operator-controlled secret storage. Product
records may retain non-secret connection and binding references for health,
audit, usage, and provenance, but they must not expose the secret or make the
connection user-editable.

The current backend loads multiple operator-approved bindings from the
`DIFY_WORKFLOWS` process-secret configuration. Configuration is startup-bound
and requires a service restart. Runtime binding creation and execution both
enforce the admitted binding-key set, so a user cannot turn an arbitrary key
into a provider connection. The current user OpenAPI contains no Dify endpoint,
credential, Workflow, or variable-mapping onboarding route.

A later administrator page may manage the same logical binding records, but it
requires a separate administrator authorization boundary, encrypted
database-backed secret storage, audit history, and safe dynamic reload. These
capabilities are deferred; the current single-user `admin` bootstrap account
does not imply that ordinary authenticated routes are operator routes.

This boundary preserves catalog verification, usage accounting, future
entitlement enforcement, and marketplace settlement. A future enterprise
bring-your-own-provider option is a separate commercial product decision. It
requires explicit entitlement, isolated credentials, operator review, and
clear billing rules; it must not appear as an unmetered bypass around the
Expert Marketplace.

### Category and search boundary

Categories are an operator-owned vocabulary, not user profile data. An Expert
may have no category and remains visible in the client-defined `All` view. The
current read-only catalog exposes active categories with counts through
`GET /api/v1/experts/categories`. The list endpoint accepts repeated `category`
parameters; multiple selected categories use OR semantics, while category,
provider, media, eligibility, and text filters combine with AND semantics.

The initial operator vocabulary contains `data-analysis`,
`document-extraction`, `image-generation`, and `software-development`.
Existing acceptance experts are assigned by backend migration and registration
code; users and the platform assistant cannot create, rename, reorder,
activate, deactivate, or assign categories.

The `query` parameter searches the expert key, display name, description,
category label, tags, purpose, and responsibilities. Whitespace-separated
terms must all match, and results use deterministic relevance ordering before
the stable display-name tie-breaker. The API does not expose the internal score.

### Capability summary

Every active ExpertVersion exposes a versioned, structured summary with at
least:

- `expert_key`, display name, version, and lifecycle status.
- Purpose, bounded responsibilities, and explicit non-goals.
- Accepted input media and semantic input contracts.
- Declared output media and output contracts.
- Interaction mode: `conversational` or `request_response`.
- Text input mode: `required`, `optional`, or `unsupported`.
- Known limits: file size, duration, concurrency, network, GUI, GPU, and
  resource restrictions.
- Required Runtime capability categories and the binding availability state.
- Data handling statement, including whether provider-managed storage is used.
- Last verification time and a product-owned verification status.

CapabilitySummary is a discovery and planning aid. It does not replace the
deterministic feasibility validator. A missing or stale Runtime capability
profile can still block confirmation, publication, Task submission, or start.

### Version and availability rules

- Expert and ExpertVersion identities are immutable once referenced by a
  conversation, OrganizationSpec, Task, or Artifact lineage record.
- A new provider configuration, capability change, prompt contract change, or
  output contract change creates a new ExpertVersion.
- Deactivating an ExpertVersion prevents new conversations and new
  OrganizationSpec references. Existing conversations and Tasks remain
  queryable and retain their historical version.
- Replacing an expert in an organization is an explicit organization-version
  change. It is never an in-place RuntimeBinding mutation on an already
  published version.
- The catalog must distinguish `active`, `verification_required`, `blocked`,
  and `retired`; the assistant cannot select `blocked` or `retired` entries.

## Direct expert conversation

An ExpertConversation is a private trial surface, not a hidden organization
or Task. It is owner-scoped and pinned to one ExpertVersion from its first
message.

### Interaction modes

The product transcript is unified, but provider continuity is explicit:

- `conversational`: the provider may retain a provider conversation handle;
  Nexwork stores only the opaque handle and normalized message/turn facts.
- `request_response`: each user message or attachment is an independent
  provider invocation. The UI may still render the exchange as a chat, but the
  product does not claim provider memory between turns.

Interaction mode and text input mode are independent. Interaction mode states
whether the provider retains conversation continuity. Text input mode states
whether the provider consumes the user's free-form message. A file-driven
request-response expert may therefore accept an attachment without accepting
text.

The deployed business-card Dify Workflow is a `request_response` expert. It
accepts one image file and returns one structured JSON result. It must not be
treated as a Codex-like persistent session merely because the UI uses a chat
layout. Its current Workflow input contract has no text variable, so its
ExpertVersion advertises `text_input_mode: "unsupported"`; each image is an
independent provider request.

A Codex-backed expert normally uses `conversational` mode. Each direct
ExpertConversation receives a product-owned managed Codex Thread and Workspace
pinned to that ExpertVersion. The trial Thread is not reused as the Thread of a
formal organization role; organization execution retains its own role-owned
Workspace, Thread, Assignment history, and Artifact lineage.

### Direct conversation invariants

- ExpertConversation should reuse the existing owner-scoped Message,
  Attachment, Turn, event, and reconnect primitives. It must remain a distinct
  conversation kind and must not inherit the platform assistant's organization
  and Task Action tools.
- A direct expert message cannot silently create an Organization, Task,
  Assignment, or formal role.
- A chat attachment cannot silently become a Task input or an organization
  Artifact. The user must explicitly choose an organization and confirm the
  mapping through the existing Task-input contract.
- Provider result files are untrusted and must enter controlled owner-scoped
  conversation-result storage with media, size, hash, and access validation.
  They are not released Task Artifacts. An explicit Task-input mapping may
  later import the verified bytes into the Artifact pipeline.
- The conversation shows product-owned status, usage, and error facts. It does
  not show API keys, provider URLs, internal prompts, hidden reasoning, host
  paths, or opaque provider payloads.
- A provider limitation is rendered honestly. A Workflow that cannot remember
  earlier turns must say so rather than fabricating continuity.

### Trial-to-organization flow

The supported promotion path is:

```text
Browse ExpertVersion
  -> Start private ExpertConversation
  -> Test with user text or supported input
  -> Inspect normalized result and limitations
  -> Ask platform assistant to use the selected ExpertVersion
  -> Assistant proposes OrganizationSpec role and feasibility preview
  -> User confirms and publishes the organization version
  -> Task dispatches bounded Assignment through the pinned RuntimeBinding
```

Direct trial success does not bypass organization confirmation or Runtime
feasibility. The assistant may use any active eligible expert in the current
no-billing version, but it must still preserve the existing preview-first,
explicit-confirmation, and deterministic feasibility gates.

## Platform assistant access

The platform assistant receives a controlled catalog index, not arbitrary
provider configuration. Its expert-discovery tools should expose:

- list and search by capability, media, interaction mode, and availability;
- read one ExpertVersion's CapabilitySummary and limitations;
- request a feasibility preview for an expert-backed role; and
- include a selected ExpertVersion reference in a proposed OrganizationSpec.

The assistant has full product permission in this version to propose and use
any active, operator-curated expert. "Full permission" means it does not need a
separate user approval for each expert selection. It does not mean that the
assistant may:

- publish an organization without the user's confirmation;
- bypass feasibility, provider availability, or Artifact validation;
- activate a blocked or retired ExpertVersion;
- read provider credentials or private provider prompts;
- invent and persist a new formal role; or
- write an arbitrary provider endpoint or command into an OrganizationSpec.

The assistant's organization proposal must retain expert provenance so the user
can see which expert version will execute each role and what its boundaries
are. A role remains a Nexwork role; an expert is its selected executor or
capability source, not a replacement for the organization lead or Task plan.

## Provider-neutral integration

Expert Marketplace code must depend on the provider-neutral execution boundary,
not on Dify-specific branches. The adapter registry resolves the provider from
the pinned RuntimeBinding. Provider-specific endpoint, workflow ID, credentials,
conversation ID, run ID, and callback data remain outside OrganizationSpec,
LangGraph state, and public CapabilitySummary.

The current adapter set is native Codex and Dify. Catalog APIs, assistant tools,
ExpertConversation services, and organization proposal logic must not branch on
those provider names. A provider adapter supplies its declared interaction
mode, continuity support, input delivery, result normalization, cancellation,
usage, and recovery behavior through shared product ports.

For a Codex-backed ExpertVersion, the catalog stores normalized capabilities
and a reference to its operator-approved instruction or Skill package and
RuntimeBinding. Private prompts and Skill internals are not public catalog
fields. Direct trials use ExpertConversation-owned Runtime resources, while
formal organization execution uses role-owned Runtime resources.

For a Dify-backed ExpertVersion, the catalog stores a provider-owned binding
reference and normalized capabilities. It does not store a Dify graph. The
existing `assignment_json`, `instruction_text`, `single_file`, and
`json_artifact` adapter modes are transport details of that binding and remain
replaceable by another provider adapter.

The implementation must add an explicit product-owned ExpertVersion provenance
reference to an organization role contract or its immutable companion record.
Do not encode an expert ID into `runtime_binding_key`, role responsibility text,
or provider-specific configuration. RuntimeBinding alone is insufficient to
explain which catalog capability and version the user selected.

## Future commercial boundary

The current version has no payment, checkout, price, subscription, licensing,
ranking, review, revenue-share, or publisher self-service API. Do not add fake
prices or entitlement states to current UI fixtures.

Future commercialization must be added as a separate layer:

- `Offer` or `PriceVersion` describes what can be purchased.
- `Entitlement` records which user or organization may use it.
- `UsageSettlement` records billable usage and provider cost policy.
- Publisher and review records govern public third-party distribution.

RuntimeBinding is not an entitlement, and a successful direct trial is not a
purchase. Future entitlement checks may filter the assistant's selectable
catalog, but they must not rewrite the provider-neutral role-execution
contract, OrganizationSpec topology, or historical execution records. Expert
Turns and expert-backed Assignments must retain ExpertVersion provenance and
normalized usage so a later billing layer can settle historical usage without
reconstructing it from provider logs.

User-managed Dify connections are not implied by future payment support. If an
enterprise bring-your-own-provider offer is approved later, it remains a
separate entitled integration surface and does not automatically publish the
connected applications into the shared marketplace catalog.

## Current acceptance direction

The Expert Marketplace foundation is accepted only when all of the following
are independently demonstrated:

- The catalog lists active ExpertVersions with structured capabilities and
  explicit limitations.
- A user can hold a private direct conversation with one expert and observe
  normalized success and failure states.
- Supported attachments remain owner-scoped and do not become Task inputs
  implicitly.
- The assistant can discover the expert, explain why it is feasible, and
  include its pinned version in an organization proposal.
- The user can confirm and publish that proposal, then run a Task whose role
  resolves to the expert's provider without changing plan topology.
- Provider output becomes a released Artifact only after product validation.
- No provider secret, internal graph, hidden reasoning, or arbitrary host path
  appears in the public catalog, conversation, or organization contract.
- The current version contains no billing or public-publishing surface.

The first reference cases are one native Codex-backed conversational expert and
the Dify business-card `request_response` expert. Acceptance must cover direct
trial behavior for both provider families, assistant composition, and the
already accepted mixed Codex/Dify Task path.

## Deferred scope

The following are not part of the current Expert Marketplace foundation:

- Public expert self-publishing or arbitrary third-party plugin execution.
- Ordinary-user or assistant-managed Dify servers, API keys, applications, or
  Workflow bindings.
- Group conversations, social sharing, ratings, reviews, or leaderboards.
- Expert conversations through WeChat, Feishu, Telegram, or WhatsApp.
- Payment, checkout, licensing, subscriptions, usage settlement, or revenue
  sharing.
- Automatic expert installation into every organization without versioned
  provenance and user confirmation.
- Provider adapters beyond native Codex and the current Dify boundary.
- Treating an expert's internal Workflow or Agent graph as Nexwork's plan.
