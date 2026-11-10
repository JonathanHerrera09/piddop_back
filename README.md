# Backend

Base project structure for the API. Application modules will be added incrementally.

## Requirements

- Node.js 20 or later
- MySQL 8 or later

## Setup

1. Copy `.env.example` to `.env` and set the MySQL credentials.
2. Run `npm install`.
3. Run `npm run dev:seeder`.

The command creates the database configured in `DB_NAME` (default: `allorajd`), applies the initial migration, and inserts the initial roles and demo companies. It is safe to run again because the seed data uses idempotent inserts.

## Database scope

The initial schema contains all platform tables, including authentication tokens and audit logs. The physical schema is the source of truth during this foundation stage; business rules, associations, and model-level validations will be implemented with their respective modules.

## Deploy with Docker

Docker Compose and a GitHub Actions workflow are included for deployment to a VPS. The setup follows the Lumefy server pattern: GitHub Actions connects over SSH, updates the repository, and builds on the VPS; the API joins the shared Nginx Proxy Manager Docker network. Follow [the deployment guide](docs/deploy-docker.md) to configure it.

## Instalador de escritorio

El instalador público de Windows se sirve desde `GET /downloads/Piddop-Setup.exe`.
Para publicar una versión nueva, genera el instalador en `web` con `npm run desktop:build:exe` y copia el archivo resultante a `backend/public/downloads/Piddop-Setup.exe` antes del despliegue. La pantalla de acceso web obtiene esta URL automáticamente a partir de `VITE_API_URL`; `VITE_DESKTOP_DOWNLOAD_URL` permite reemplazarla por un CDN o una URL de releases.
