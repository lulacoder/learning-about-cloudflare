import { DurableObject } from "cloudflare:workers";
import type { WorkerEnv } from "../alchemy.run.ts";
import { generateReply } from "./ai.ts";

export type Chat = {
  id: string;
  title: string;
  created_at: number;
  reply_status: "idle" | "pending" | "error";
};
export type Message = {
  id: string;
  chat_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: number;
};
export type NewChatResult = { chat: Chat; user: Message };

const REPLY_TIMEOUT_MS = 120_000;

export class ChatStore extends DurableObject<WorkerEnv> {
  constructor(ctx: DurableObjectState, env: WorkerEnv) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS chats (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        owner_id TEXT,
        reply_status TEXT NOT NULL DEFAULT 'idle',
        reply_started_at INTEGER
      )`);
      const columns = ctx.storage.sql.exec<{ name: string }>("PRAGMA table_info(chats)").toArray();
      if (!columns.some((column) => column.name === "owner_id")) {
        ctx.storage.sql.exec("ALTER TABLE chats ADD COLUMN owner_id TEXT");
      }
      if (!columns.some((column) => column.name === "reply_status")) {
        ctx.storage.sql.exec("ALTER TABLE chats ADD COLUMN reply_status TEXT NOT NULL DEFAULT 'idle'");
      }
      if (!columns.some((column) => column.name === "reply_started_at")) {
        ctx.storage.sql.exec("ALTER TABLE chats ADD COLUMN reply_started_at INTEGER");
      }
      ctx.storage.sql.exec(`CREATE INDEX IF NOT EXISTS chats_by_owner
        ON chats (owner_id, created_at)`);
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

  createChatWithMessage(ownerId: string, content: string): NewChatResult {
    const chat = {
      id: crypto.randomUUID(),
      title: content.trim().replace(/\s+/g, " ").slice(0, 200),
      created_at: Date.now(),
      reply_status: "pending" as const,
    };
    const user = {
      id: crypto.randomUUID(), chat_id: chat.id, role: "user" as const,
      content, created_at: Date.now(),
    };
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec(
        "INSERT INTO chats (id, title, created_at, owner_id, reply_status, reply_started_at) VALUES (?, ?, ?, ?, ?, ?)",
        chat.id, chat.title, chat.created_at, ownerId, chat.reply_status, chat.created_at,
      );
      this.ctx.storage.sql.exec(
        "INSERT INTO messages (id, chat_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)",
        user.id, user.chat_id, user.role, user.content, user.created_at,
      );
    });
    void this.replyToChat(chat.id, ownerId, chat.created_at).catch((cause) => console.error("Could not finish reply", cause));
    return { chat, user };
  }

  private expireStaleReplies() {
    this.ctx.storage.sql.exec(
      "UPDATE chats SET reply_status = 'error', reply_started_at = NULL WHERE reply_status = 'pending' AND reply_started_at < ?",
      Date.now() - REPLY_TIMEOUT_MS,
    );
  }

  listChats(ownerId: string): Chat[] {
    this.expireStaleReplies();
    return this.ctx.storage.sql
      .exec<Chat>(
        "SELECT id, title, created_at, reply_status FROM chats WHERE owner_id = ? ORDER BY created_at DESC LIMIT 100",
        ownerId,
      )
      .toArray();
  }

  getChat(ownerId: string, id: string): Chat | null {
    this.expireStaleReplies();
    return this.ctx.storage.sql
      .exec<Chat>("SELECT id, title, created_at, reply_status FROM chats WHERE id = ? AND owner_id = ?", id, ownerId)
      .toArray()[0] ?? null;
  }

  listMessages(ownerId: string, chatId: string): Message[] | null {
    if (!this.getChat(ownerId, chatId)) return null;
    return this.messagesForChat(chatId);
  }

  private messagesForChat(chatId: string): Message[] {
    return this.ctx.storage.sql
      .exec<Message>(
        "SELECT * FROM messages WHERE chat_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 100",
        chatId,
      )
      .toArray().reverse();
  }

  sendMessage(ownerId: string, chatId: string, content: string): Message | "pending" | null {
    const chat = this.getChat(ownerId, chatId);
    if (!chat) return null;
    if (chat.reply_status === "pending") return "pending";

    const startedAt = Date.now();
    const user = this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec("UPDATE chats SET reply_status = 'pending', reply_started_at = ? WHERE id = ?", startedAt, chatId);
      return this.insertMessage(chatId, "user", content);
    });
    this.broadcast(chatId, ownerId, { type: "message" });
    void this.replyToChat(chatId, ownerId, startedAt).catch((cause) => console.error("Could not finish reply", cause));
    return user;
  }

  private async replyToChat(chatId: string, ownerId: string, startedAt: number): Promise<void> {
    try {
      const reply = await generateReply(this.env.AI, this.messagesForChat(chatId));
      let saved = false;
      this.ctx.storage.transactionSync(() => {
        const active = this.ctx.storage.sql.exec<{ reply_started_at: number }>(
          "SELECT reply_started_at FROM chats WHERE id = ? AND owner_id = ? AND reply_status = 'pending'",
          chatId, ownerId,
        ).toArray()[0];
        if (active?.reply_started_at !== startedAt) return;
        this.insertMessage(chatId, "assistant", reply);
        this.ctx.storage.sql.exec("UPDATE chats SET reply_status = 'idle', reply_started_at = NULL WHERE id = ?", chatId);
        saved = true;
      });
      if (saved) this.broadcast(chatId, ownerId, { type: "message" });
    } catch (cause) {
      console.error("Workers AI request failed", cause);
      this.ctx.storage.sql.exec(
        "UPDATE chats SET reply_status = 'error', reply_started_at = NULL WHERE id = ? AND owner_id = ? AND reply_status = 'pending' AND reply_started_at = ?",
        chatId, ownerId, startedAt,
      );
      this.broadcast(chatId, ownerId, { type: "assistant_error", error: "Assistant unavailable" });
    }
  }

  async fetch(request: Request): Promise<Response> {
    const match = new URL(request.url).pathname.match(/^\/api\/chats\/([^/]+)\/socket$/);
    if (!match || request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return Response.json({ error: "WebSocket upgrade required" }, { status: 426 });
    }
    const chatId = match[1];
    const ownerId = request.headers.get("X-Chat-User-Id");
    if (!ownerId || !this.getChat(ownerId, chatId)) {
      return Response.json({ error: "Chat not found" }, { status: 404 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.serializeAttachment({ chatId, ownerId });
    this.ctx.acceptWebSocket(server);
    const protocols = request.headers.get("Sec-WebSocket-Protocol") ?? "";
    const headers = protocols.split(",").some((item) => item.trim() === "chat")
      ? { "Sec-WebSocket-Protocol": "chat" }
      : undefined;
    return new Response(null, { status: 101, webSocket: client, headers });
  }

  async webSocketMessage(socket: WebSocket, frame: string | ArrayBuffer) {
    void frame;
    socket.close(1008, "Send messages through the HTTP API");
  }

  private insertMessage(chatId: string, role: Message["role"], content: string): Message {
    const message = {
      id: crypto.randomUUID(), chat_id: chatId, role, content, created_at: Date.now(),
    };
    this.ctx.storage.sql.exec(
      "INSERT INTO messages (id, chat_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)",
      message.id, message.chat_id, message.role, message.content, message.created_at,
    );
    return message;
  }

  private broadcast(chatId: string, ownerId: string, event: unknown) {
    const payload = JSON.stringify(event);
    for (const socket of this.ctx.getWebSockets()) {
      const attachment = socket.deserializeAttachment() as { chatId?: string; ownerId?: string } | null;
      if (attachment?.chatId === chatId && attachment.ownerId === ownerId) {
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
