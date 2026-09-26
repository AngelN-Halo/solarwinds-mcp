FROM node:24.5.0-alpine AS build

WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY tsconfig.json ./
COPY src ./src
RUN npm run build
RUN pnpm prune --prod

FROM node:24.5.0-alpine

ENV NODE_ENV=production
WORKDIR /app

RUN addgroup -S mcp && adduser -S -G mcp mcp
COPY --from=build --chown=mcp:mcp /app/package.json ./
COPY --from=build --chown=mcp:mcp /app/node_modules ./node_modules
COPY --from=build --chown=mcp:mcp /app/build ./build

USER mcp
ENTRYPOINT ["node"]
CMD ["build/index.js"]
