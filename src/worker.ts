import type { WorkerEnv } from "../alchemy.run.ts";
import { createAuth } from "./auth.ts";

// The Durable Object class must be exported by the Worker's entry module.
export { ChatStore } from "./chat-store.ts";

const json = (body: unknown, status = 200) => Response.json(body, {
  status,
  headers: { "Cache-Control": "no-store" },
});
const error = (message: string, status: number) => json({ error: message }, status);

function isMessageBody(value: unknown): value is { content: string } {
  return (
    typeof value === "object" && value !== null && "content" in value &&
    typeof value.content === "string" && value.content.trim().length > 0 &&
    value.content.length <= 10_000
  );
}

function allowedOrigin(request: Request, env: WorkerEnv, required = false): boolean {
  const origin = request.headers.get("Origin");
  if (!origin) return !required && request.headers.get("Sec-Fetch-Site") !== "cross-site";
  return origin === new URL(env.BETTER_AUTH_URL).origin;
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return json({ ok: true });
    }

    const auth = createAuth(env);
    if (url.pathname.startsWith("/api/auth/")) return auth.handler(request);
    if (!url.pathname.startsWith("/api/chats")) return error("Not found", 404);

    const isSocket = /^\/api\/chats\/[^/]+\/socket$/.test(url.pathname);
    if (!allowedOrigin(request, env, isSocket)) return error("Forbidden origin", 403);
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) return error("Unauthorized", 401);

    const userId = session.user.id;
    const chats = env.CHATS.getByName("app");
    if (url.pathname === "/api/chats") {
      if (request.method === "GET") return json({ chats: await chats.listChats(userId) });
      if (request.method === "POST") {
        const body = await request.json().catch(() => null);
        if (!isMessageBody(body)) return error("Invalid message", 400);
        return json(await chats.createChatWithMessage(userId, body.content.trim()), 201);
      }
    }

    const messages = url.pathname.match(/^\/api\/chats\/([^/]+)\/messages$/);
    if (messages) {
      const chatId = messages[1];
      if (request.method === "GET") {
        const items = await chats.listMessages(userId, chatId);
        return items ? json({ messages: items }) : error("Chat not found", 404);
      }
      if (request.method === "POST") {
        const body = await request.json().catch(() => null);
        if (!isMessageBody(body)) return error("Invalid message", 400);
        const result = await chats.sendMessage(userId, chatId, body.content);
        if (!result) return error("Chat not found", 404);
        if (result === "pending") return error("Wait for the current reply", 409);
        return json({ user: result }, 201);
      }
    }

    if (request.method === "GET" && isSocket) {
      const headers = new Headers(request.headers);
      headers.set("X-Chat-User-Id", userId);
      return chats.fetch(new Request(request, { headers }));
    }
    return error("Not found", 404);
  },
};
