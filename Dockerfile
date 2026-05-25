# Frontend image: build with Vite, serve with Nginx.
FROM node:20-alpine AS builder
WORKDIR /app

ARG VITE_API_BASE_URL=/api/v1
ARG VITE_ENABLE_SUBSCRIPTION_CHECKS=true
ARG VITE_FLW_PUBLIC_KEY
ARG VITE_FLW_PAYMENT_OPTIONS=mobilemoney

ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_ENABLE_SUBSCRIPTION_CHECKS=$VITE_ENABLE_SUBSCRIPTION_CHECKS
ENV VITE_FLW_PUBLIC_KEY=$VITE_FLW_PUBLIC_KEY
ENV VITE_FLW_PAYMENT_OPTIONS=$VITE_FLW_PAYMENT_OPTIONS

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM nginx:1.27-alpine AS runner
COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
