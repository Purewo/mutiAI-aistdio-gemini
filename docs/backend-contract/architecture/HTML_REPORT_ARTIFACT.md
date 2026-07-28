# Static HTML report Artifacts

Status: V1 backend contract implemented on `feat/activity-media-semantics`.

## Product purpose

Nexwork supports visual data, statistics, and market-analysis results through a
controlled static HTML report Artifact. The report is a formal Task deliverable,
not arbitrary HTML embedded in assistant Markdown and not private Runtime state.

The execution path is:

```text
specialist Assignment
-> self-contained report.html output contract
-> Artifact validation and immutable release
-> organization-lead review
-> assistant html_report presentation request
-> product-owned content block
-> sandboxed frontend iframe and controlled download
```

The assistant may reference a report after reading persisted product state. It
does not generate a URL, choose iframe permissions, copy HTML into a Message, or
claim that an unvalidated Workspace file is a report.

## V1 report policy

V1 supports `render_mode=static` only. A report must be UTF-8 `text/html` and may
contain inline HTML, CSS, and SVG. It may embed base64 GIF, JPEG, PNG, or WebP
images. It cannot contain:

- JavaScript or event-handler attributes.
- Forms, iframes, frames, objects, embeds, or active-document elements.
- External scripts, stylesheets, images, fonts, media, or network URLs.
- CSS imports, CSS URLs, or legacy CSS expressions.
- Redirecting `meta http-equiv` directives.

These rules are enforced when an Artifact is published. An HTML report that
violates the policy fails Artifact validation and is not released.

Interactive HTML is deferred. It requires a separate origin, an explicit
interactive capability, stronger isolation, and a distinct contract. It must not
be enabled by relaxing the V1 static policy.

## Assistant content contract

Assistant content schema `1.1` adds a product-owned `html_report` block:

```json
{
  "type": "html_report",
  "text": "The static trend report is ready.",
  "title": "Trend report",
  "source": {
    "kind": "artifact",
    "task_id": "task-id",
    "artifact_id": "artifact-id"
  },
  "render_mode": "static",
  "preview_status": "available",
  "preview_url": "/api/v1/tasks/task-id/artifacts/artifact-id/content",
  "download_url": "/api/v1/tasks/task-id/artifacts/artifact-id/content?download=true",
  "media_type": "text/html",
  "byte_size": 24576,
  "sha256": "64-lowercase-hex-characters"
}
```

The Runtime wire request contains only `kind=html_report`, `artifact_id`, and
optional display text. The backend resolves the owning Task, verifies the current
user, requires a released `text/html` Artifact, verifies stored bytes and static
HTML policy, and generates the source identity and URLs. Invalid, foreign,
unreleased, non-HTML, or corrupt resources do not become content blocks.

`preview_status` is one of:

- `available`: The report is within the inline preview limit.
- `too_large`: The report remains downloadable but inline preview is refused.

The inline preview limit is 10 MiB. It is independent from chat attachment,
assistant content-reader, and Task input limits.

## HTTP preview policy

The existing Artifact content URL remains the controlled byte-serving endpoint.
For `text/html`, the response adds:

- `Content-Security-Policy` that disables scripts, connections, objects, forms,
  media, external resources, and framing by non-product origins.
- `X-Content-Type-Options: nosniff`.
- `Referrer-Policy: no-referrer`.
- The immutable Artifact ETag and SHA-256 identity.

The frontend must use an iframe with the `sandbox` attribute and must not add
`allow-same-origin`, `allow-scripts`, forms, popups, downloads, or top-navigation
permissions. The iframe loads only `preview_url`. The frontend must not use raw
HTML injection or reconstruct a URL from local storage paths.

Reports larger than 10 MiB receive
`ARTIFACT_HTML_PREVIEW_TOO_LARGE` for inline preview. Their `download_url`
continues to serve an attachment.

## Artifact lineage and replay

An HTML report keeps the normal immutable Artifact lineage: Task, producing
Assignment, PlanStep, ReplayRun, contract key, schema version, file name, media
type, SHA-256, byte size, validation summary, version, and superseded identity.

A replay creates a new report Artifact version. It never mutates the earlier
report. Data-analysis and market reports should include the data source, data
timestamp, timezone, and analysis range inside the report so users can distinguish
historical output from current data.

## Frontend acceptance

The frontend handoff must verify:

1. A real released HTML Artifact renders from an `html_report` content block.
2. Refreshing the conversation restores the same report from persisted content.
3. Preview and download use the backend-provided URLs.
4. Desktop and mobile layouts have no page-level horizontal overflow.
5. A script, external resource, oversized report, missing Artifact, and unreleased
   Artifact all produce an explicit fallback instead of a blank frame.
6. The iframe cannot read the parent page, product session state, or product API.
7. Replayed Tasks preserve both previous and new report versions.
