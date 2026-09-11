#!/usr/bin/env bash
# Starts Postgres, the FastAPI backend, and the Next.js frontend for local dev.
# Ctrl-C stops the backend and frontend (Postgres keeps running in the background).
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

if [ ! -d backend/.venv ]; then
  echo "backend/.venv not found. Run: cd backend && python3.11 -m venv .venv && ./.venv/bin/pip install -r requirements.txt" >&2
  exit 1
fi
if [ ! -d front/node_modules ]; then
  echo "front/node_modules not found. Run: cd front && npm install -f" >&2
  exit 1
fi
if [ ! -f front/.env ]; then
  echo "front/.env not found. Create it with POSTGRES_URL, BASE_URL, AUTH_SECRET (see README)." >&2
  exit 1
fi

if ! docker start autoshazam-postgres >/dev/null 2>&1; then
  echo "Starting new autoshazam-postgres container..."
  docker run -d --name autoshazam-postgres \
    -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=autoshazam \
    -p 5432:5432 postgres:16 >/dev/null
fi

echo "Waiting for Postgres..."
until docker exec autoshazam-postgres pg_isready -U postgres >/dev/null 2>&1; do
  sleep 1
done

if [ -z "${SOULSEEK_ACCOUNT:-}" ]; then
  echo "SOULSEEK_ACCOUNT is not set: Soulseek downloads are disabled (see README)." >&2
fi

(cd front && npm run db:migrate)
(cd front && npm run db:ensure-dev-account)

trap 'kill 0' EXIT

(cd backend && ./.venv/bin/python -m uvicorn src.app.main:app --reload --host 0.0.0.0 --port 8000) &
(cd front && npm run dev) &

echo "Backend:  http://localhost:8000/docs"
echo "Frontend: http://localhost:3000"
echo "Dev login: test@test.com / admin123 (active plan)"
wait
