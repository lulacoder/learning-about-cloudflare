import type { WorkerEnv } from "../alchemy.run.ts";
import { isMessageBody } from "./chat-store.ts";

// The Durable Object class must be exported by the Worker's entry module.
export { ChatStore } from "./chat-store.ts";

const json = (body: unknown, status = 200) => Response.json(body, {
  status,
  headers: { "Cache-Control": "no-store" },
});
const error = (message: string, status: number) => json({ error: message }, status);

function authorized(request: Request, expected: string): boolean {
  const authorization = request.headers.get("Authorization");
  const bearer = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : undefined;
  const protocolToken = request.headers.get("Sec-WebSocket-Protocol")
    ?.split(",")
    .map((value) => value.trim())
    .find((value) => value.startsWith("token."))
    ?.slice("token.".length);
  const supplied = bearer ?? protocolToken;
  if (!supplied || supplied.length !== expected.length) return false;
  const encoder = new TextEncoder();
  return crypto.subtle.timingSafeEqual(
    encoder.encode(supplied), encoder.encode(expected),
  );
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return json({ ok: true });
    }
    if (!authorized(request, env.CHAT_API_TOKEN)) return error("Unauthorized", 401);

    const chats = env.CHATS.getByName("app");
    if (url.pathname === "/chats") {
      if (request.method === "GET") return json({ chats: await chats.listChats() });
      if (request.method === "POST") {
        const body = await request.json().catch(() => null);
        if (
          typeof body !== "object" || body === null || !("title" in body) ||
          typeof body.title !== "string" || !body.title.trim() || body.title.length > 200
        ) return error("A title of 1 to 200 characters is required", 400);
        return json({ chat: await chats.createChat(body.title.trim()) }, 201);
      }
    }

    const messages = url.pathname.match(/^\/chats\/([^/]+)\/messages$/);
    if (messages) {
      const chatId = messages[1];
      if (request.method === "GET") {
        if (!(await chats.getChat(chatId))) return error("Chat not found", 404);
        return json({ messages: await chats.listMessages(chatId) });
      }
      if (request.method === "POST") {
        const body = await request.json().catch(() => null);
        if (!isMessageBody(body)) return error("Invalid message", 400);
        const result = await chats.sendMessage(chatId, body.content);
        if (!result) return error("Chat not found", 404);
        return result.assistant
          ? json({ user: result.user, assistant: result.assistant }, 201)
          : json({ error: "Assistant unavailable", user: result.user }, 502);
      }
    }

    if (request.method === "GET" && /^\/chats\/[^/]+\/socket$/.test(url.pathname)) {
      return chats.fetch(request);
    }
    return error("Not found", 404);
  },
};
