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
