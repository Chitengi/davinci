# Hostinger VPS Docker Manager Deployment

This setup deploys two containers:

- `frontend`: Nginx serving Vite build and proxying `/api/*` to backend.
- `backend`: Express API on port `4000`.

## 1. Prepare production environment file

1. Copy `backend/env.production.example` to `backend/.env.production`.
2. Fill all required secrets and real values.
3. Ensure these values are correct for production:
   - `DATABASE_URL`
   - `CORS_ORIGIN=https://your-domain.com`
   - `FLW_SECRET_KEY`
   - `FLW_WEBHOOK_HASH`
   - `PAYMENT_WEBHOOK_SECRET`
   - `ADMIN_API_KEY`

## 2. Prepare frontend build variables

1. Copy `env.hostinger.example` to `.env` in project root.
2. Set at least:
   - `VITE_FLW_PUBLIC_KEY`
3. Keep `VITE_API_BASE_URL=/api/v1` unless your API is hosted separately.

## 3. Upload project to VPS

Upload the full `my-upper-primary-school-app` folder to your VPS (for example into `/opt/apps/my-upper-primary-school-app`).

## 4. Deploy with Docker Compose in Hostinger Docker Manager

Use compose file: `docker-compose.hostinger.yml`.

If using SSH directly:

```bash
cd /opt/apps/my-upper-primary-school-app
docker compose -f docker-compose.hostinger.yml up -d --build
```

## 5. Expose domain

Point your domain/subdomain to the VPS and route HTTP traffic to port `80` (frontend container).

## 6. Verify health

- Frontend: `http://your-domain/`
- Backend health: `http://your-domain/api/v1/health`

## 7. Rolling updates

After pulling new code:

```bash
cd /opt/apps/my-upper-primary-school-app
docker compose -f docker-compose.hostinger.yml up -d --build
```

## Notes

- Frontend uses same-origin API in production (`/api/v1`) and Nginx proxies to `backend:4000`.
- Do not commit `backend/.env.production`.
- If you use TLS termination with reverse proxy at VPS level, keep `CORS_ORIGIN` set to your HTTPS domain.
