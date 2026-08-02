# Dify Workflow role adapter

Status: M4 implementation boundary for the first external role executor.

## What the adapter means

Nexwork treats one published Dify Workflow as the opaque executor of one
bounded role Assignment. Dify's internal nodes, Agents, tools, memory, and
provider retries do not become Nexwork roles, PlanSteps, LangGraph nodes, or
public product events.

The role still belongs to Nexwork. Nexwork owns the Assignment, input bindings,
output contracts, Artifact validation, lead review, Replay lineage, usage
presentation, and final Task state.

## Operator configuration

The adapter is configured by the operator, not by an OrganizationSpec or a
user-provided API key. `DIFY_WORKFLOWS` accepts up to 100 application bindings.
The bindings may target multiple applications on one Dify server or
applications distributed across multiple Dify servers:

```text
DIFY_ENABLED=true
DIFY_WORKFLOWS=[{"binding_key":"dify-business-card","base_url":"https://dify-a.example.com/v1","api_key":"<secret>","input_variable":"business_card","input_mode":"single_file","output_variable":"result","output_mode":"json_artifact"},{"binding_key":"dify-image-generation","base_url":"https://dify-b.example.com/v1","api_key":"<secret>","input_variable":"image_prompt","input_mode":"instruction_text","output_variable":"image_url","output_mode":"json_artifact"}]
```

Each object may independently set `input_variable`, `input_mode`,
`instruction_variable`, `output_variable`, `output_mode`, `timeout_seconds`,
`max_response_bytes`, `max_input_bytes`, and `max_artifact_bytes`. Missing
optional values use the same defaults as the legacy single-application
settings. Binding keys must be unique. The legacy `DIFY_BINDING_KEY`,
`DIFY_API_BASE_URL`, `DIFY_API_KEY`, and related variables remain compatible
when `DIFY_WORKFLOWS` is unset, but the two configuration modes cannot be mixed.

API keys stay in process secret configuration. They are not returned by the
Runtime Binding API, placed in a Workspace, copied into a prompt, or stored in
a public Artifact. The process loads this configuration at startup, so a
configuration change currently requires a service restart.

The Provider Registry exposes only admitted binding keys. It rejects a
user-created RuntimeBinding that names an unknown Dify binding before Task
execution, and it rechecks persisted bindings when resolving a role. Providers
without an explicit binding allow-list retain the existing unrestricted key
behavior.

This release does not expose Dify onboarding through the user OpenAPI. A future
administrator page can use an operator-only control-plane service backed by the
same configuration contract after the product has a separate administrator
authorization model, database-backed secret storage, audit records, and safe
dynamic reload. Those APIs and hot reload are not part of M4.

The role's RuntimeBinding uses `provider: "dify"`, the configured binding key,
and `security_mode: "external_managed"`. That mode compiles to
`approval_policy: "never"`, `sandbox_mode: "provider-managed"`, and network
access enabled. It does not grant Dify access to the Nexwork host. The binding
must have a trusted capability profile before feasibility can admit a Task.

## Request contract

The adapter sends a blocking Dify Workflow request to:

```text
POST {configured base_url}/workflows/run
Authorization: Bearer <operator secret>
Content-Type: application/json
```

In `assignment_json` mode, the configured Dify input variable receives one JSON
string containing:

```json
{
  "execution_id": "product execution ID",
  "role_key": "the Nexwork role",
  "instructions": "the bounded Assignment packet",
  "input_artifacts": [
    {
      "artifact_id": "product Artifact ID",
      "contract_key": "analysis.input.v1",
      "schema_version": "1.0",
      "media_type": "application/json",
      "file_name": "input.json",
      "byte_size": 12,
      "sha256": "verified digest",
      "encoding": "base64",
      "content": "exact Artifact bytes"
    }
  ],
  "output_contracts": [
    {
      "contract_key": "analysis.result.v1",
      "schema_version": "1.0",
      "media_type": "application/json",
      "file_name": "result.json"
    }
  ],
  "output_schema": {
    "type": "object",
    "properties": {}
  }
}
```

Before transmission, the adapter resolves each materialized input inside the
product staging Workspace and verifies its byte size and SHA-256 against the
immutable Artifact binding. It sends exact bytes as base64 and never exposes a
host path. The configured input limit applies to the aggregate decoded bytes
for one Assignment. The Dify Workflow is responsible for decoding this stable
envelope into its own internal variables.

### Instruction-text input mode

Text-first Dify applications can use a native paragraph or text variable
without receiving the Nexwork transport envelope:

```json
{
  "input_variable": "image_prompt",
  "input_mode": "instruction_text"
}
```

The adapter sends the bounded Assignment `instructions` value exactly as the
configured variable value. This mode is intended for text-driven Expert
Versions and Workflows such as image generation. Nexwork still owns the
Assignment contract and validates any returned Artifact; it does not infer a
variable name from the provider or Workflow title.

The adapter also sends `response_mode: "blocking"` and a deterministic Dify
user identity derived from the product execution ID. The provider run ID is
stored as the product Runtime job identity after a successful response.

### Single-file input mode

An existing Dify Workflow can declare one native file variable instead of
decoding the Nexwork Assignment envelope:

```json
{
  "input_variable": "business_card",
  "input_mode": "single_file"
}
```

In this mode, the Assignment must bind exactly one immutable input Artifact.
The adapter verifies its staged bytes, uploads it through Dify's
`POST /files/upload` API, and passes the returned file ID to the configured
Workflow variable. Image, audio, and video media types map to their Dify file
categories; other media types map to `document`. The host path and product
storage path are never sent to Dify.

A single-file Workflow may also declare a separate text variable. The operator
must set `instruction_variable` on that `DIFY_WORKFLOWS` entry to the exact
variable name before Nexwork sends the bounded Assignment or Expert trial
instructions. The legacy equivalent is `DIFY_INSTRUCTION_VARIABLE`. Nexwork
never guesses a Dify variable name. If the Workflow declares no text variable,
the binding is file-driven: it receives only the uploaded file, and its
associated ExpertVersion must advertise `text_input_mode: "unsupported"`.

The upload is still part of the first blocking adapter slice. A later durable
provider implementation must persist the upload and Workflow-run identities
before it can claim restart-safe exactly-once submission.

## Output contract

Planning and lead-review Assignments return the JSON required by their existing
Nexwork output schema through the configured output variable.

Specialist Assignments use the following provider-side envelope so Dify can
return files without writing into a Nexwork Workspace:

```json
{
  "status": "completed",
  "summary": "short delivery summary",
  "artifacts": [
    {
      "contract_key": "analysis.result.v1",
      "media_type": "application/json",
      "encoding": "utf-8",
      "content": "{\"value\": 42}"
    }
  ]
}
```

The adapter recovers the declared output contract from the immutable
Assignment packet, validates that the returned set and media types match, and
stages inline content under the product-managed Workspace. The existing
Artifact pipeline then computes hashes, validates the output, and releases the
Artifact. A Dify-hosted URL is not a released Artifact.

Binary content uses `encoding: "base64"` and remains subject to the configured
Artifact byte limit. Unsafe file names, duplicate contract keys, wrong media
types, invalid base64, and incomplete output sets are normalized as
`invalid_delivery` or `artifact_import_failed`.

### Flat JSON output mode

An existing Dify Workflow can return ordinary named outputs instead of a
`nexwork_delivery` envelope:

```json
{
  "output_mode": "json_artifact"
}
```

This mode requires exactly one declared `application/json` output contract.
The adapter serializes the complete Dify `outputs` object as UTF-8 JSON, stages
it under the product Workspace, and returns a normalized internal
`AssignmentDelivery`. The existing Artifact pipeline remains responsible for
hashing, contract validation, release, and lead review. This mode is generic;
it does not contain business-card field names or Workflow-specific logic.

## Current M4 lifecycle limit

The first adapter slice uses Dify's blocking response mode. It returns a
completed product result or a normalized failure and does not claim transparent
reattachment or cancellation after an API process restart. `recover` and
`cancel` return a truthful unsupported result for this slice.

The first live mixed-provider acceptance used `single_file` plus
`json_artifact` for a business-card Workflow. See
[M4 Dify business-card acceptance](../acceptance/M4_DIFY_BUSINESS_CARD_ACCEPTANCE.md).
The first two-server acceptance also verified `instruction_text` against a
text-driven image-generation Workflow. See
[M4 multi-Dify live acceptance](../acceptance/M4_MULTI_DIFY_LIVE_ACCEPTANCE.md).

Long-running Dify Workflows require a later streaming or polling provider
implementation with a durable provider run record, callback verification,
bounded cancellation, and restart recovery. The generic Provider Registry is
designed so this extension does not modify LangGraph or TaskOrchestrator.

## Provider-neutral boundary

The product calls a `RoleExecutionRequest` through the Provider Registry. The
request carries the bounded instructions, immutable input Artifact manifest,
output schema, execution policy snapshot, and optional product staging area.
The Codex compatibility bridge maps that request to Thread, Turn, and Workspace
fields. The Dify adapter maps it directly to a Workflow run. Neither provider's
private identifiers enter the common organization plan.

See [ADR-0007](../decisions/ADR-0007-provider-neutral-role-execution.md) and
the [M4 stability matrix](../acceptance/M4_STABILITY_MATRIX.md) for ownership
and acceptance requirements.
