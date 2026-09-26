import { DurableObject } from "cloudflare:workers";
import type { WorkerEnv } from "../alchemy.run.ts";
import { generateReply } from "./ai.ts";
import { ChatDb } from "./chat-db.ts";

export class ChatStore extends DurableObject<WorkerEnv> {
  private readonly db: ChatDb;

  constructor(ctx: DurableObjectState, env: WorkerEnv) {
    super(ctx, env);
    this.db = new ChatDb(ctx.storage);
    ctx.blockConcurrencyWhile(async () => this.db.initialize());
  }

  createChatWithMessage(ownerId: string, content: string) {
    const result = this.db.createChatWithMessage(ownerId, content);
    void this.replyToChat(result.chat.id, ownerId).catch((cause) => console.error("Could not finish reply", cause));
    return result;
  }

  listChats(ownerId: string) {
    return this.db.listChats(ownerId);
  }

  listMessages(ownerId: string, chatId: string) {
    return this.db.listMessages(ownerId, chatId);
  }

  sendMessage(ownerId: string, chatId: string, content: string) {
    const user = this.db.addUserMessage(ownerId, chatId, content);
    if (!user || user === "pending") return user;
    this.broadcast(chatId, ownerId, { type: "message" });
    void this.replyToChat(chatId, ownerId).catch((cause) => console.error("Could not finish reply", cause));
    return user;
  }

  private async replyToChat(chatId: string, ownerId: string): Promise<void> {
    try {
      const reply = await generateReply(this.env.AI, this.db.messagesForChat(chatId));
      if (this.db.saveAssistant(ownerId, chatId, reply)) {
        this.broadcast(chatId, ownerId, { type: "message" });
      }
    } catch (cause) {
      console.error("Workers AI request failed", cause);
      this.db.failReply(ownerId, chatId);
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
    if (!ownerId || !this.db.getChat(ownerId, chatId)) {
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
