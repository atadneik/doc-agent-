# Logistics MVP

TypeScript: pnpm workspace, NestJS backend, React/Vite frontend. Python: uv in services/ai-worker.
Run commands from repository root unless documented otherwise. Keep domain independent of infrastructure.
Business rules are versioned JSON under knowledge/rules and validated against contracts/schemas/rules.json.
Never infer missing values or invent evidence coordinates. Fixtures and fake adapters are test-only; production must fail explicitly if local inference is unavailable.
Checks: pnpm build; pnpm test; cd services/ai-worker && uv run pytest. Integration: pnpm integration.
Bind local services to 127.0.0.1. Do not commit weights, uploads, runtime files or secrets.
