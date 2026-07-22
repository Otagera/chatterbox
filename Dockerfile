# syntax=docker/dockerfile:1

# ---------- build ----------
FROM node:20-alpine AS build
WORKDIR /app

# Install with the lockfile for reproducible builds.
COPY package.json package-lock.json ./
RUN npm ci

# Source needed by the build (tailwind reads views/, tsc reads app/ + index.ts).
COPY tsconfig.json tailwind.config.js postcss.config.js ./
COPY types.d.ts ./
COPY app ./app
COPY views ./views
COPY sdk ./sdk
COPY index.ts ./

# Produces views/styles/style.css (tailwind) and dist/ (tsc).
RUN npm run build

# Drop dev dependencies so they aren't copied into the runtime image.
RUN npm prune --omit=dev

# ---------- runtime ----------
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3005

# curl is used by the container healthcheck.
RUN apk add --no-cache curl

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/dist ./dist
# Pug templates, compiled CSS and static assets are read at runtime from
# ../views relative to dist/, so the tree must be preserved.
COPY --from=build /app/views ./views

# MikroORM resolves `entities: ["./dist/app/entities"]` relative to cwd,
# so the working directory must stay /app.
USER node

EXPOSE 3005

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://localhost:3005/healthz || exit 1

CMD ["node", "dist/index.js"]
