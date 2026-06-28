# AI-ISP

AI-ISP is a Cloudflare Workers web application for conversational research around impulsive spending. It provides a multilingual chat workspace, stores user-level AI provider settings, builds structured user profiles from chat history, and aggregates shared behavioral traits across users.

## Features

- User registration and login with bearer-token sessions stored in Cloudflare KV.
- OpenAI-compatible chat integration configured per user from the web UI.
- Impulsive-spending assistant that asks clarifying questions, avoids forced analysis for ambiguous input, and supports delayed-decision guidance.
- Structured user profiles with summary, impulse level, risk score, traits, triggers, purchase categories, emotional states, intervention preferences, and evidence.
- Agentic intervention loop that classifies the current conversation into sense, interrupt, reframe, or plan stages and recommends the next-best intervention move.
- Theory cards that map detected spending signals to dual-process theory, temporal discounting, implementation intentions, and social influence.
- Novel research UI with an impulse-risk trajectory chart, loop-state board, and distinct-user-normalized aggregate features.
- Aggregate shared traits counted by distinct users so repeated messages from one user do not inflate global feature counts.
- Admin console for reviewing users, profile details, AI configuration status, deleting users, and clearing profile/chat data.
- Multilingual interface and assistant output for Simplified Chinese, English, Japanese, and Spanish.
- Static frontend served through the Worker assets binding.

## Project Structure

```text
view/
  index.html           Frontend HTML
  script.js            UI state, auth, chat, admin, i18n, and API calls
  style.css            Frontend styles

worker/
  src/index.js         Cloudflare Worker API and application logic
  src/migrations/      D1 database migrations
  package.json         Wrangler and TypeScript scripts
  tsconfig.json        Type checking configuration
  wrangler.toml        Worker, D1, KV, vars, and static asset configuration
```

## Runtime Stack

- Cloudflare Workers for the API and static asset routing.
- Cloudflare D1 for users, messages, profiles, AI settings, and aggregate traits.
- Cloudflare KV for login sessions.
- Wrangler for local development, migrations, and deployment.
- Any OpenAI-compatible chat completion API configured by each user.

## API Overview

The Worker handles these API routes under `/api`:

```text
POST   /api/register
POST   /api/login
POST   /api/logout
GET    /api/me
GET    /api/history
DELETE /api/history
POST   /api/chat
GET    /api/insights
GET    /api/ai-settings
PUT    /api/ai-settings
GET    /api/admin/users
DELETE /api/admin/users/:userId
POST   /api/admin/users/:userId/profile
```

Non-API requests are served from `view/` through the `ASSETS` binding.

## Research Contribution Framing

The current app is designed to answer three common research-review questions directly in the product UI:

- `Agentic AI features`: the app maintains a persistent impulse-state memory, selects a next-best intervention move, and keeps cycling through a stateful intervention loop instead of acting like a one-shot classifier.
- `Theory foundation`: the app exposes how dual-process theory, temporal discounting, implementation intentions, and social influence can justify specific micro-interventions for impulsive spending.
- `Novel UI / visualization`: the right-hand research panel shows a risk trajectory, an impulse-loop board, and distinct-user-normalized aggregate features so reviewers can see more than a single risk score.

## Database

The D1 migrations create these tables:

- `users`: user IDs, password hashes, salts, and login timestamps.
- `messages`: user and assistant chat messages.
- `user_profiles`: latest structured profile per user.
- `user_ai_settings`: per-user request URL, model, and API key.
- `user_features`: normalized per-user traits used for aggregation.
- `common_features`: aggregate feature counts across distinct users.

## Local Development

Install dependencies from the Worker directory:

```bash
cd worker
npm install
```

If you are setting up a fresh Cloudflare environment, create a D1 database and KV namespace:

```bash
npx wrangler d1 create ai-isp-d1
npx wrangler kv namespace create kv
```

Copy the generated `database_id` and KV namespace `id` into `worker/wrangler.toml`:

```toml
[[d1_databases]]
binding = "db"
database_name = "ai-isp-d1"
database_id = "..."
migrations_dir = "src/migrations"

[[kv_namespaces]]
binding = "kv"
id = "..."
```

Apply local D1 migrations and start the development server:

```bash
npm run db:migrate:local
npm run dev
```

Open the local URL printed by Wrangler.

## AI Settings

AI API keys are not configured as global Worker secrets. Each user enters their own OpenAI-compatible settings in the sidebar after logging in:

- Request URL, for example `https://api.deepseek.com`
- Model, for example `deepseek-chat`
- API key

The Worker appends `/chat/completions` to the request URL unless the URL already ends with that path.

`worker/wrangler.toml` also contains default variables:

```toml
[vars]
AI_BASE_URL = "https://api.deepseek.com"
AI_MODEL = "deepseek-v4-flash"
SESSION_TTL_SECONDS = "604800"
```

The current Worker code uses `SESSION_TTL_SECONDS` for session duration. AI provider settings are loaded from each user's saved configuration.

## Admin Access

The Worker ensures a built-in admin account exists whenever an API request is handled:

```text
User ID: admin
Password: 123456
```

The admin console can view users, inspect stored profiles, check AI configuration status, clear a user's profile and chat history, and delete non-admin users.

Change the default admin credentials in `worker/src/index.js` before deploying beyond local testing.

## Available Scripts

Run these from `worker/`:

```bash
npm run dev                # Start Wrangler dev server
npm run deploy             # Deploy the Worker
npm run db:migrate:local   # Apply D1 migrations locally
npm run db:migrate:remote  # Apply D1 migrations remotely
npm run typecheck          # Run TypeScript type checking
```

## Deployment

Apply remote migrations first:

```bash
cd worker
npm run db:migrate:remote
```

Deploy the Worker:

```bash
npm run deploy
```

## Security and Privacy Notes

This app stores chat content, AI API keys, and behavioral profiles. Before production use, add clear privacy notices, data export/deletion workflows, stronger admin credential management, rate limiting, abuse protection, and a stronger password policy.
