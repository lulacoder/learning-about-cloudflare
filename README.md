# Stillroom local preview

The frontend lives in `web/`. It uses React, TanStack Router, and TanStack Query. Routes follow the folder convention: `web/src/routes/index.tsx` is the home page, and `web/src/routes/chat/$chatId/index.tsx` is a conversation page.

## Run locally

Install dependencies in the project root and in `web/`:

```powershell
bun install
cd web
bun install
```

Start the Worker from the project root:

```powershell
bun run infra:dev
```

In a second terminal, start the frontend:

```powershell
cd web
bun run dev
```

Open <http://127.0.0.1:5173/> and enter the `CHAT_API_TOKEN` from the root `.env` file. The token is kept in this browser tab's session storage for the local preview. The Vite server forwards `/api/*` requests and WebSockets to the local Worker on port 8787. The Worker itself still uses `/chats/*` routes.

Run `bun run build` in `web/` to build and typecheck the frontend.
