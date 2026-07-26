# Gemini frontend instructions

Read `docs/GEMINI_HANDOFF.md` before changing the frontend.

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
- **Contract Exchange**: The public repository `https://github.com/Purewo/mutiAI-aistdio-gemini` is the source of truth for our current code and the place where backend developers put relevant documents (e.g., OpenAPI, schemas). If the user states that the backend has updated the contract, pull the latest files from there and inspect them.

## Handoff expectation

A frontend commit is a candidate implementation. The project integrator performs real-backend integration and browser verification before merging it into a release branch.
