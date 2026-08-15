# syntax=docker/dockerfile:1.6

# ===== Stage 1: Build Vue 3 + Vite + TS =====
FROM node:20-alpine AS builder

WORKDIR /app

# 先 copy lockfile，利用 layer cache
COPY package.json package-lock.json* ./
RUN npm ci || npm install

# 再 copy 源码，改代码不会使上面的 npm ci 层失效
COPY . .

# 可选：build 时注入 API base（docker-compose build args → VITE_API_BASE）
# 若未传 arg，保留为空字符串，前端运行时会 fallback 到 localStorage 里用户填的 apiBase
ARG VITE_API_BASE=""
ENV VITE_API_BASE="${VITE_API_BASE}"

# 可选：build 时注入应用部署前缀（子路径），Vite base 和 Vue Router base 都会自动读到
# 默认生产部署在 /admin-v2/ 子路径；如果要部署到域名根，改为 "/"
ARG VITE_APP_BASE="/admin-v2/"
ENV VITE_APP_BASE="${VITE_APP_BASE}"

RUN npm run build

# ===== Stage 2: Nginx SPA serve =====
FROM nginx:1.27-alpine AS runtime

# 清理默认站点 + 复制自定义 conf + dist
RUN rm -f /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf

COPY --from=builder /app/dist /usr/share/nginx/html

# SPA 容器内 80 端口；compose 里只 expose，不直接 publish
EXPOSE 80
