# PistonRH

Full-stack app for tracking piston/"Unit", fuel valve, and exhaust valve running hours (RH) across a fleet of vessels.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5, port 8080
- DB: PostgreSQL + Drizzle ORM (`lib/db`)
- Validation: Zod v4, `drizzle-zod`
- API codegen: Orval (from `lib/api-spec/openapi.yaml`) into `lib/api-zod` and `lib/api-client-react`
- Frontend: React + Vite (port 22244), shadcn/ui, Tailwind CSS v4, React Query, React Hook Form, Wouter

## First-time setup

```
pnpm install
pnpm run codegen          # generates lib/api-zod and lib/api-client-react from the OpenAPI spec
pnpm run typecheck:libs
docker compose up -d postgres
pnpm run db:push
pnpm run db:seed:admin    # creates the first Technical Office admin user (see env vars below)
```

Required env vars (put in a `.env` at the repo root — see `.env.example`):

- `DATABASE_URL` — Postgres connection string
- `PORT` — API server port (8080 in dev)
- `JWT_SECRET` — signs the auth cookie
- `CORS_ORIGIN` — allowed frontend origin in dev (`http://localhost:22244`)
- `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME` — used once by `db:seed:admin` to bootstrap the first Technical Office user

## Run

```
pnpm run dev:api    # terminal 1
pnpm run dev:web    # terminal 2
```

Frontend: http://localhost:22244 — API: http://localhost:8080/api

## Regenerating the API client

Whenever `lib/api-spec/openapi.yaml` changes, run `pnpm run codegen` before touching frontend code that consumes the new hooks/schemas.

## Production deployment (Docker)

Single container serves both the built API and the built frontend (same-origin, so the
auth cookie needs no cross-site handling).

```
cp .env.example .env   # set a real JWT_SECRET, ADMIN_PASSWORD, etc.
docker compose up -d --build
docker compose exec app node dist/seed-admin.cjs   # one-time: bootstrap the first admin
```

App: http://localhost:8080 (frontend + `/api/*` on the same origin).

The `app` service reads `JWT_SECRET`/`CORS_ORIGIN` from the shell environment (or a
root `.env` file, which `docker compose` loads automatically) — see `.env.example`.
`CORS_ORIGIN` isn't actually used cross-origin here since everything is same-origin in
production, but the API still checks it, so set it to wherever the container is reachable
(e.g. `http://localhost:8080` or your real domain).

## Hosted deployment (Render)

`render.yaml` is a Blueprint — Render reads it and provisions a web service (built from
`Dockerfile`) plus a managed Postgres database in one step, no local Docker needed.

1. Push this repo to GitHub (already done if you're reading this from the deployed repo).
2. On [render.com](https://dashboard.render.com/blueprints), click **New Blueprint
   Instance**, connect the `PistonRH` repo, and confirm. It'll ask for `ADMIN_EMAIL` and
   `ADMIN_PASSWORD` (not stored in the repo) before creating the services.
3. After the first deploy finishes, check the assigned URL (`https://<something>.onrender.com`
   in the Render dashboard) and update the `CORS_ORIGIN` env var on the `pistonrh` service to
   match it exactly if it differs from the `render.yaml` default.
4. Open the service's **Shell** tab in the Render dashboard and run:
   ```
   node dist/seed-admin.cjs
   ```
   This bootstraps the first Technical Office admin account, one time.
5. Share the `https://<something>.onrender.com` URL with vessel officers, along with their
   login credentials created via Settings → User Management.

Free-tier caveats: the free web service spins down after ~15 minutes idle (first request
after a gap is slow while it wakes up), and Render's free Postgres databases expire after
90 days unless upgraded to a paid plan.
