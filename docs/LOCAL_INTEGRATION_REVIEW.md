# Local integration and review boundary

Google AI Studio cannot access the project integrator's local filesystem or backend process. Gemini develops against the versioned contracts and real-response fixtures committed to this repository. It may use isolated, clearly labeled frontend-only mock data to inspect layout and visual states, but mock execution is not a real-backend acceptance result.

Frontend-only mock data must remain outside `contracts/` and `fixtures/api/`, reuse contracted fields and state values, and stay explicitly separable from the real API transport. A failed real request must produce its contracted error state instead of silently switching the application into mock mode.

## Frontend transport requirements

- Use relative `/api/v1` requests by default.
- Include browser credentials so the HttpOnly session cookie is sent.
- Keep the API base configurable without embedding the integrator's Windows paths.
- Support a local development proxy from `/api` to `http://127.0.0.1:8000`.
- Do not require a remote server or public deployment for M3 validation.

## Review ownership

After Gemini commits a bounded implementation, the Codex project integrator:

1. Pulls the Gemini branch into the local frontend checkout.
2. Installs dependencies and runs the repository's type, lint, test, and build commands.
3. Starts the real backend locally and connects the frontend through the development proxy.
4. Verifies authentication, requests, SSE reconnect behavior, Artifact access, browser console output, responsive layout, and core interactions.
5. Reports reproducible defects with request, response, console, screenshot, or interaction evidence.

The project integrator does not modify Gemini's frontend implementation during review. The project owner sends the report to Gemini, and Gemini owns all corrective code changes and commits. Contract defects remain backend-owned and are fixed in the core repository before refreshing this repository's snapshots.
