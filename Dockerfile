# 1 — Build stage
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# 2 — Runtime stage
FROM node:20-alpine

WORKDIR /app

# Copy only what is needed for production
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

# Environment variables
ARG POSTGRES_HOST=""
ARG POSTGRES_PORT=""
ARG POSTGRES_DATABASE=""
ARG POSTGRES_USER=""
ARG POSTGRES_PASSWORD=""

ENV POSTGRES_HOST=${POSTGRES_HOST}
ENV POSTGRES_PORT=${POSTGRES_PORT}
ENV POSTGRES_DATABASE=${POSTGRES_DATABASE}
ENV POSTGRES_USER=${POSTGRES_USER}
ENV POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
ENV PORT=5033

EXPOSE 5033

CMD ["node", "dist/src/main.js"]
