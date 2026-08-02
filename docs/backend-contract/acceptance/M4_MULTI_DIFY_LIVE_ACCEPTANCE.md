# M4 multi-Dify live acceptance

Status: Backend provider and catalog acceptance complete. Frontend integration
starts after this handoff.

Acceptance date: 2026-08-01

## Scope

This run verifies that two operator-configured Dify applications can be loaded
into one provider-neutral adapter, routed by binding key, and used by different
Expert input contracts. Credentials were injected from the local encrypted
Agent Vault. No endpoint, API key, or Workflow secret was written to the
database, repository, or output.

The two bindings were:

- `dify-lingyu-business-card`: native file input, `business_card`.
- `dify-northwest-image-generation`: native paragraph input, `image_prompt`.

The probe used an isolated adapter invocation and did not write to the shared
development database.

## Contract preflight

Both provider `/parameters` calls returned HTTP 200 and authenticated with the
injected application key:

| Binding | Input kind | Variable | Required |
| --- | --- | --- | --- |
| `dify-lingyu-business-card` | `file` | `business_card` | yes |
| `dify-northwest-image-generation` | `paragraph` | `image_prompt` | yes |

The second result exposed a transport gap in the first implementation: using
`assignment_json` sent the complete Nexwork Assignment JSON as the image
prompt. The adapter now supports the explicit operator mode
`input_mode: "instruction_text"`, which sends only the bounded `instructions`
value to the configured text variable.

## Final live run

The final run used one `DifyRuntimeAdapter` containing both bindings. The input
card was a 71,990-byte JPEG with SHA-256
`bf71ade8ea335a209003aeb1d2ec5585d728c31160e09346d92e31554645db40`.

| Check | Business card | Image generation |
| --- | ---: | ---: |
| Product result | `completed` | `completed` |
| Elapsed time | 11.5 s | 20.4 s |
| Provider tokens | 1,544 | 0 reported |
| Runtime job identity | present | present |
| Output validation | Seven known fields matched | Structured output keys present |
| Generated URL | not applicable | Operator prefix matched, HTTP 200 |
| Text mapping | not applicable | Exact prompt preserved |

The adapter reported two distinct binding origins and two distinct credential
values internally, while never printing either value. The sorted binding list
contained exactly the two configured keys. No response from one application
was used as the other's result.

## Catalog and category verification

The targeted backend regression registered native Codex, business-card Dify,
image-generation Dify, and an uncategorized expert in an isolated database.
It verified:

- `GET /api/v1/experts/categories` exposes the operator-owned
  `data-analysis`, `document-extraction`, `image-generation`, and
  `software-development` categories in deterministic order.
- Repeated `category` parameters use OR semantics across all three populated
  categories.
- `query=image generate` finds only the image-generation expert.
- An expert with no category remains visible in the client-defined `All` view.
- No public category mutation route exists (`POST .../experts/categories`
  returns 405).

The focused regression run passed 6 tests, including the new text transport,
multi-binding configuration, category migration, category fixture, catalog
search, and isolated category API behavior.

## Input-size note

An initial attempt with the historical 1,702,391-byte source image reached the
business-card provider but returned its upstream `[models] Server Unavailable`
timeout. This is a provider/plugin capacity issue, not a routing or
authentication failure. The final run used the verified 71,990-byte JPEG and
completed successfully. The product's configured Dify input limit remains
independent from this provider-specific model/plugin behavior.

## Boundary result

Multiple operator-managed Dify applications are ready for frontend catalog and
private-trial integration. Users and the platform assistant still cannot add
or edit Dify servers, API keys, Workflow identifiers, or variable mappings.
The service must be restarted after changing the operator configuration.

The current adapter remains blocking and request-response for Dify. Durable
restart recovery, streaming observation, and remote cancellation remain
separate follow-up work.
