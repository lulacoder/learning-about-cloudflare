import { DurableObject } from "cloudflare:workers";
import type { WorkerEnv } from "../alchemy.run.ts";
import { generateReply } from "./ai.ts";

export type Chat = { id: string; title: string; created_at: number };
export type Message = {
  id: string;
  chat_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: number;
};
export type SendResult = { user: Message; assistant: Message | null };
export type NewChatResult = SendResult & { chat: Chat };

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

  async createChatWithMessage(content: string): Promise<NewChatResult> {
    const chat = {
      id: crypto.randomUUID(),
      title: content.trim().replace(/\s+/g, " ").slice(0, 200),
      created_at: Date.now(),
    };
    const user = {
      id: crypto.randomUUID(), chat_id: chat.id, role: "user" as const,
      content, created_at: Date.now(),
    };
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec(
        "INSERT INTO chats (id, title, created_at) VALUES (?, ?, ?)",
        chat.id, chat.title, chat.created_at,
      );
      this.ctx.storage.sql.exec(
        "INSERT INTO messages (id, chat_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)",
        user.id, user.chat_id, user.role, user.content, user.created_at,
      );
    });
    const assistant = await this.replyToChat(chat.id);
    return { chat, user, assistant };
  }

  listChats(): Chat[] {
    return this.ctx.storage.sql
      .exec<Chat>("SELECT * FROM chats ORDER BY created_at DESC LIMIT 100")
      .toArray();
  }

  getChat(id: string): Chat | null {
    return this.ctx.storage.sql
      .exec<Chat>("SELECT * FROM chats WHERE id = ?", id)
      .toArray()[0] ?? null;
  }

  listMessages(chatId: string): Message[] {
    return this.ctx.storage.sql
      .exec<Message>(
        "SELECT * FROM messages WHERE chat_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 100",
        chatId,
      )
      .toArray().reverse();
  }

  async sendMessage(chatId: string, content: string): Promise<SendResult | null> {
    if (!this.getChat(chatId)) return null;

    const user = this.insertMessage(chatId, "user", content);
    const assistant = await this.replyToChat(chatId);
    return { user, assistant };
  }

  private async replyToChat(chatId: string): Promise<Message | null> {
    let reply: string;
    try {
      reply = await generateReply(this.env.AI, this.listMessages(chatId));
    } catch (cause) {
      console.error("Workers AI request failed", cause);
      this.broadcast(chatId, { type: "assistant_error", error: "Assistant unavailable" });
      return null;
    }
    return this.insertMessage(chatId, "assistant", reply);
  }

  async fetch(request: Request): Promise<Response> {
    const match = new URL(request.url).pathname.match(/^\/chats\/([^/]+)\/socket$/);
    if (!match || request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return Response.json({ error: "WebSocket upgrade required" }, { status: 426 });
    }
    const chatId = match[1];
    if (!this.getChat(chatId)) {
      return Response.json({ error: "Chat not found" }, { status: 404 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.serializeAttachment({ chatId });
    this.ctx.acceptWebSocket(server);
    const protocols = request.headers.get("Sec-WebSocket-Protocol") ?? "";
    const headers = protocols.split(",").some((item) => item.trim() === "chat")
      ? { "Sec-WebSocket-Protocol": "chat" }
      : undefined;
    return new Response(null, { status: 101, webSocket: client, headers });
  }

  async webSocketMessage(socket: WebSocket, frame: string | ArrayBuffer) {
    const { chatId } = socket.deserializeAttachment() as { chatId: string };
    let data: unknown;
    try {
      data = JSON.parse(typeof frame === "string" ? frame : "");
    } catch {
      socket.send(JSON.stringify({ type: "error", error: "Invalid JSON" }));
      return;
    }
    if (!isMessageBody(data)) {
      socket.send(JSON.stringify({ type: "error", error: "Invalid message" }));
      return;
    }
    const result = await this.sendMessage(chatId, data.content);
    if (!result) socket.send(JSON.stringify({ type: "error", error: "Chat not found" }));
  }

  private insertMessage(chatId: string, role: Message["role"], content: string): Message {
    const message = {
      id: crypto.randomUUID(), chat_id: chatId, role, content, created_at: Date.now(),
    };
    this.ctx.storage.sql.exec(
      "INSERT INTO messages (id, chat_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)",
      message.id, message.chat_id, message.role, message.content, message.created_at,
    );
    this.broadcast(chatId, { type: "message", message });
    return message;
  }

  private broadcast(chatId: string, event: unknown) {
    const payload = JSON.stringify(event);
    for (const socket of this.ctx.getWebSockets()) {
      const attachment = socket.deserializeAttachment() as { chatId?: string } | null;
      if (attachment?.chatId === chatId) {
        try { socket.send(payload); } catch { /* The client disconnected. */ }
      }
    }
  }
}

export function isMessageBody(value: unknown): value is { content: string } {
  return (
    typeof value === "object" && value !== null && "content" in value &&
    typeof value.content === "string" && value.content.trim().length > 0 &&
    value.content.length <= 10_000
  );
}
