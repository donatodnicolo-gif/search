# Dockerfile per l'API Deluxy (contesto di build = root del monorepo)
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json ./
COPY api/package.json ./api/
RUN npm install --workspace api --include-workspace-root=false
COPY api ./api
WORKDIR /app/api
RUN npx prisma generate && npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/api/dist ./dist
COPY --from=build /app/api/prisma ./prisma
COPY --from=build /app/api/package.json ./package.json
EXPOSE 3000
# In produzione: prisma migrate deploy prima dell'avvio
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
