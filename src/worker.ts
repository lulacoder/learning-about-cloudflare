import { DurableObject } from "cloudflare:workers";
import type { WorkerEnv } from "../alchemy.run.ts";

type Chat = { id: string; title: string; created_at: number };
type Message = {
  id: string;
  chat_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: number;
};

const json = (body: unknown, status = 200) => Response.json(body, { status });
const error = (message: string, status: number) => json({ error: message }, status);

export class ChatStore extends DurableObject<WorkerEnv> {
  constructor(ctx: DurableObjectState, env: WorkerEnv) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS chats (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          created_at INTEGER NOT NULL
        )`);
      ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS messages (
          id TEXT PRIMARY KEY,
          chat_id TEXT NOT NULL REFERENCES chats(id),
          role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
          content TEXT NOT NULL,
          created_at INTEGER NOT NULL
        )`);
      ctx.storage.sql.exec(`CREATE INDEX IF NOT EXISTS messages_by_chat
        ON messages (chat_id, created_at)`);
    });
  }

  createChat(title: string): Chat {
    const chat = { id: crypto.randomUUID(), title, created_at: Date.now() };
    this.ctx.storage.sql.exec(
      "INSERT INTO chats (id, title, created_at) VALUES (?, ?, ?)",
      chat.id,
      chat.title,
      chat.created_at,
    );
    return chat;
  }

  listChats(): Chat[] {
    return this.ctx.storage.sql
      .exec<Chat>("SELECT * FROM chats ORDER BY created_at DESC LIMIT 100")
      .toArray();
  }

  getChat(id: string): Chat | null {
    return (
      this.ctx.storage.sql
        .exec<Chat>("SELECT * FROM chats WHERE id = ?", id)
        .toArray()[0] ?? null
    );
  }

  listMessages(chatId: string): Message[] {
    return this.ctx.storage.sql
      .exec<Message>(
        "SELECT * FROM messages WHERE chat_id = ? ORDER BY created_at, rowid LIMIT 100",
        chatId,
      )
      .toArray();
  }

  addMessage(chatId: string, content: string): Message | null {
    if (!this.getChat(chatId)) return null;
    const message: Message = {
      id: crypto.randomUUID(),
      chat_id: chatId,
      role: "user",
      content,
      created_at: Date.now(),
    };
    this.ctx.storage.sql.exec(
      "INSERT INTO messages (id, chat_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)",
      message.id,
      message.chat_id,
      message.role,
      message.content,
      message.created_at,
    );
    this.broadcast(chatId, { type: "message", message });
    return message;
  }
// this is our websocket handler for the chat store, it will handle incoming websocket connections and messages
  async fetch(request: Request): Promise<Response> {
    const match = new URL(request.url).pathname.match(/^\/chats\/([^/]+)\/socket$/);
    if (!match || request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return error("WebSocket upgrade required", 426);
    }
    const chatId = match[1];
    if (!this.getChat(chatId)) return error("Chat not found", 404);

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.serializeAttachment({ chatId });
    this.ctx.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(socket: WebSocket, frame: string | ArrayBuffer) {
    const { chatId } = socket.deserializeAttachment() as { chatId: string };
    try {
      const data = JSON.parse(typeof frame === "string" ? frame : "") as unknown;
      if (!isMessageBody(data)) {
        socket.send(JSON.stringify({ type: "error", error: "Invalid message" }));
        return;
      }
      this.addMessage(chatId, data.content);
    } catch {
      socket.send(JSON.stringify({ type: "error", error: "Invalid JSON" }));
    }
  }

  private broadcast(chatId: string, event: unknown) {
    const payload = JSON.stringify(event);
    for (const socket of this.ctx.getWebSockets()) {
      const attachment = socket.deserializeAttachment() as { chatId?: string } | null;
      if (attachment?.chatId === chatId) socket.send(payload);
    }
  }
}

function isMessageBody(value: unknown): value is { content: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "content" in value &&
    typeof value.content === "string" &&
    value.content.trim().length > 0 &&
    value.content.length <= 10_000
  );
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return json({ ok: true });
    }

    const chats = env.CHATS.getByName("app");
    if (url.pathname === "/chats") {
      if (request.method === "GET") return json({ chats: await chats.listChats() });
      if (request.method === "POST") {
        const body = await request.json().catch(() => null);
        if (
          typeof body !== "object" ||
          body === null ||
          !("title" in body) ||
          typeof body.title !== "string" ||
          !body.title.trim() ||
          body.title.length > 200
        ) return error("A title of 1 to 200 characters is required", 400);
        return json({ chat: await chats.createChat(body.title.trim()) }, 201);
      }
    }

    const messages = url.pathname.match(/^\/chats\/([^/]+)\/messages$/);
    if (messages) {
      const chatId = messages[1];
      if (!(await chats.getChat(chatId))) return error("Chat not found", 404);
      if (request.method === "GET") {
        return json({ messages: await chats.listMessages(chatId) });
      }
      if (request.method === "POST") {
        const body = await request.json().catch(() => null);
        if (!isMessageBody(body)) return error("Invalid message", 400);
        return json({ message: await chats.addMessage(chatId, body.content) }, 201);
      }
    }

    if (url.pathname.match(/^\/chats\/[^/]+\/socket$/)) {
      return chats.fetch(request);
    }
    return error("Not found", 404);
  },
};
