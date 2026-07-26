# Platform-assistant API fixtures

These files were captured through the real `/api/v1/assistant` FastAPI routes
from backend contract commit `205a845` with the deterministic fake external
Runtime. They cover conversation creation, message submission, Turn completion,
message pagination, resumable events, and proposed, declined, completed, and
failed Action states. Failed Actions include the original status code and
structured details; `error_message` is localized when the resource is read.

Use `contracts/openapi.v1.json` and
`contracts/events/assistant-event.v1.json` as the authoritative contracts.
Fixture IDs, timestamps, and reply text are captured values, not product
defaults. Do not add fields or states to these files by hand.
