## Prerequisites

Node.js 20+ (`nvm use` picks 22 from .nvmrc)
Docker

## Run

cp .env.example .env
docker compose up -d
npm install
npm run seed
npm run dev:api
npm run dev:web

Open http://localhost:3000
