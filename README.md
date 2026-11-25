## Requirements

- Node.js 22 (`nvm use` reads .nvmrc)
- Docker with Compose

## Setup

```bash
cp .env.example .env
docker compose up -d
npm install
npm run seed
```

`npm run seed` can be run any number of times.

## Run

Two terminals, from the repo root.

```bash
npm run dev:api
```

```bash
npm run dev:web
```

Open http://localhost:3000. The API listens on port 3001 and the web app proxies `/api` to it.

## Tests

Needs the mongo container running. API tests use a separate database, `smallweb_test`.

```bash
npm test
```

## Reset the data

```bash
docker compose exec -T mongo mongosh smallweb --quiet --eval 'db.dropDatabase()'
npm run seed
```
