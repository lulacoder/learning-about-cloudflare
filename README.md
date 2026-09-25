# Stillroom local development

Stillroom uses a Cloudflare Worker for API and authentication, one SQLite Durable Object for chats, and D1 for Better Auth accounts and sessions. The frontend is a React and TanStack Router app in `web/`.

## Run locally

Install dependencies in the root and in `web/`:

```powershell
bun install
cd web
bun install
cd ..
```

Set the values from `.env.example` in the root `.env` file. Generate a different `BETTER_AUTH_SECRET` of at least 32 random characters for each environment. Keep `BETTER_AUTH_URL=http://127.0.0.1:5173` for the local Vite app.

Start the Worker from the project root:

```powershell
bun run infra:dev
```

Start the frontend in a second terminal:

```powershell
cd web
bun run dev
```

Open <http://127.0.0.1:5173/signup>. The Vite server forwards `/api/*` and WebSockets to the Worker on port 8787. Alchemy applies the Better Auth D1 migration while starting the local stack.

Routes follow the folder convention: `web/src/routes/index.tsx` is the home page, `web/src/routes/login/index.tsx` and `web/src/routes/signup/index.tsx` handle accounts, and `web/src/routes/chat/` contains conversations. A chat is saved when its first message is sent, using that message as its title.

## Existing chats

Chats created with the former shared bearer token have no account owner. The Durable Object keeps those rows, but does not show them to any new account. Assign them to a specific Better Auth user before relying on old chat history. Do not give them to the first person who signs up.

## Preview deployment

The preview Worker serves the React app and `/api/*` from the same hostname. Create an ignored `.env.preview` file in the project root with a separate random `BETTER_AUTH_SECRET` of at least 32 characters and `BETTER_AUTH_URL` set to the preview Worker's HTTPS URL. Keep that secret for later deployments so existing sessions remain valid.

```powershell
bun run infra:plan
bun run infra:deploy
```

Both commands build the frontend first. Alchemy uses the `preview` stage, applies the Better Auth D1 migration, and updates the existing Worker. The deployed URL is printed when the command finishes.

The preview URL is publicly reachable and signup is open. Email verification, password reset email, and an AI usage limit are not configured yet. Add those before promoting this to a public app with unrestricted use.

Run `bun run typecheck` in the root and `bun run build` in `web/` to check both apps.
