# Single-container build: one image serves both the Express API and the
# built static frontend (same-origin, so the auth cookie needs no cross-site
# handling). Everything api-server depends on gets bundled into one .cjs
# file by esbuild, so the runtime stage needs no node_modules at all.

# ---- deps: install all workspace dependencies (needed for codegen/build) ----
FROM node:24-alpine AS deps
WORKDIR /app
RUN corepack enable
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY lib/db/package.json lib/db/package.json
COPY lib/api-spec/package.json lib/api-spec/package.json
COPY lib/api-zod/package.json lib/api-zod/package.json
COPY lib/api-client-react/package.json lib/api-client-react/package.json
COPY artifacts/api-server/package.json artifacts/api-server/package.json
COPY artifacts/piston-rh/package.json artifacts/piston-rh/package.json
RUN pnpm install --frozen-lockfile

# ---- build: codegen, typecheck, compile frontend + server ----
FROM deps AS build
COPY . .
RUN pnpm run codegen
RUN pnpm run typecheck
RUN pnpm --filter @workspace/piston-rh run build
RUN pnpm --filter @workspace/api-server run build
RUN pnpm --filter @workspace/api-server exec esbuild scripts/seed-admin.ts \
      --bundle --platform=node --format=cjs --target=node24 \
      --outfile=dist/seed-admin.cjs --external:pg-native

# ---- runtime: minimal image, single bundled server + static frontend ----
FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/artifacts/api-server/dist/index.cjs ./dist/index.cjs
COPY --from=build /app/artifacts/api-server/dist/seed-admin.cjs ./dist/seed-admin.cjs
COPY --from=build /app/artifacts/piston-rh/dist ./dist/public

EXPOSE 8080
CMD ["node", "dist/index.cjs"]
