# Gemini frontend instructions

Read `docs/GEMINI_HANDOFF.md`, `docs/M3_FRONTEND_TASK_PACKET.md`, and `docs/LOCAL_INTEGRATION_REVIEW.md` before changing the frontend.

## Rules

- This repository owns the web frontend only.
- Do not invent API endpoints, fields, status names, permissions, or backend behavior.
- Product and transport contracts come from `Purewo/mutiAI`, not from guesses in this repository.
- If a required field is missing, record the question instead of fabricating a field.
- Keep frontend work in a bounded branch or pull request.
- Do not edit backend, Runtime, LangGraph, or product database code in the core repository through frontend changes.
- Organization diagrams are rendered from structured data. Do not replace them with generated images.
- V1 has no drag-and-drop organization editor, autonomous role creation, organization invitations, or member management.
- Always implement loading, empty, error, and reconnect states when their contract is available.
- Keep visual components independent from transport details by using a small typed client layer.
- Use repository fixtures when AI Studio cannot reach the local backend. Do not invent replacement responses.

## Handoff expectation

A frontend commit is a candidate implementation. The project integrator pulls it into the local checkout, performs real-backend integration and browser verification, and reports reproducible defects. The integrator does not modify Gemini's implementation during review. Gemini owns the corrective code changes and commits.
