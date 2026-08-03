# HBS Trading Platform

Initial full-stack foundation for a crypto trading platform.

## Stack
- Backend: NestJS + Prisma + PostgreSQL
- Frontend: React + Vite + Tailwind CSS
- Infrastructure: Docker Compose + Redis
- Authentication: JWT

## Quick start
1. Copy `.env.example` to `.env`
2. Run `docker compose up --build`
3. Frontend: http://localhost:5173
4. Backend health: http://localhost:3000/api/health

## Current scope
- Project foundation
- Health endpoint
- JWT auth scaffold
- Prisma user model
- React dashboard shell

Trading logic and exchange integrations will be added in later commits.
