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

export class ChatDb {
  constructor(private readonly storage: DurableObjectStorage) {}

  initialize() {
    const sql = this.storage.sql;
    sql.exec(`CREATE TABLE IF NOT EXISTS chats (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      owner_id TEXT,
      reply_status TEXT NOT NULL DEFAULT 'idle'
    )`);
    const columns = sql.exec<{ name: string }>("PRAGMA table_info(chats)").toArray();
    if (!columns.some((column) => column.name === "owner_id")) {
      sql.exec("ALTER TABLE chats ADD COLUMN owner_id TEXT");
    }
    if (!columns.some((column) => column.name === "reply_status")) {
      sql.exec("ALTER TABLE chats ADD COLUMN reply_status TEXT NOT NULL DEFAULT 'idle'");
    }
    sql.exec("CREATE INDEX IF NOT EXISTS chats_by_owner ON chats (owner_id, created_at)");
    sql.exec(`CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      chat_id TEXT NOT NULL REFERENCES chats(id),
      role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )`);
    sql.exec("CREATE INDEX IF NOT EXISTS messages_by_chat ON messages (chat_id, created_at)");

    // A fresh instance has no AI request running for chats left pending by the old instance.
    sql.exec("UPDATE chats SET reply_status = 'error' WHERE reply_status = 'pending'");
  }

  createChatWithMessage(ownerId: string, content: string): { chat: Chat; user: Message } {
    const chat: Chat = {
      id: crypto.randomUUID(),
      title: content.trim().replace(/\s+/g, " ").slice(0, 200),
      created_at: Date.now(),
      reply_status: "pending",
    };
    const user: Message = {
      id: crypto.randomUUID(), chat_id: chat.id, role: "user",
      content, created_at: chat.created_at,
    };
    this.storage.transactionSync(() => {
      this.storage.sql.exec(
        "INSERT INTO chats (id, title, created_at, owner_id, reply_status) VALUES (?, ?, ?, ?, ?)",
        chat.id, chat.title, chat.created_at, ownerId, chat.reply_status,
      );
      this.insertMessage(user);
    });
    return { chat, user };
  }

  listChats(ownerId: string): Chat[] {
    return this.storage.sql.exec<Chat>(
      "SELECT id, title, created_at, reply_status FROM chats WHERE owner_id = ? ORDER BY created_at DESC LIMIT 100",
      ownerId,
    ).toArray();
  }

  getChat(ownerId: string, chatId: string): Chat | null {
    return this.storage.sql.exec<Chat>(
      "SELECT id, title, created_at, reply_status FROM chats WHERE id = ? AND owner_id = ?",
      chatId, ownerId,
    ).toArray()[0] ?? null;
  }

  listMessages(ownerId: string, chatId: string): Message[] | null {
    if (!this.getChat(ownerId, chatId)) return null;
    return this.messagesForChat(chatId);
  }

  messagesForChat(chatId: string): Message[] {
    return this.storage.sql.exec<Message>(
      "SELECT * FROM messages WHERE chat_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 100",
      chatId,
    ).toArray().reverse();
  }

  addUserMessage(ownerId: string, chatId: string, content: string): Message | "pending" | null {
    const chat = this.getChat(ownerId, chatId);
    if (!chat) return null;
    if (chat.reply_status === "pending") return "pending";

    const user: Message = {
      id: crypto.randomUUID(), chat_id: chatId, role: "user",
      content, created_at: Date.now(),
    };
    this.storage.transactionSync(() => {
      this.storage.sql.exec("UPDATE chats SET reply_status = 'pending' WHERE id = ?", chatId);
      this.insertMessage(user);
    });
    return user;
  }

  saveAssistant(ownerId: string, chatId: string, content: string): boolean {
    if (this.getChat(ownerId, chatId)?.reply_status !== "pending") return false;
    const assistant: Message = {
      id: crypto.randomUUID(), chat_id: chatId, role: "assistant",
      content, created_at: Date.now(),
    };
    this.storage.transactionSync(() => {
      this.insertMessage(assistant);
      this.storage.sql.exec("UPDATE chats SET reply_status = 'idle' WHERE id = ?", chatId);
    });
    return true;
  }

  failReply(ownerId: string, chatId: string) {
    this.storage.sql.exec(
      "UPDATE chats SET reply_status = 'error' WHERE id = ? AND owner_id = ? AND reply_status = 'pending'",
      chatId, ownerId,
    );
  }

  private insertMessage(message: Message) {
    this.storage.sql.exec(
      "INSERT INTO messages (id, chat_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)",
      message.id, message.chat_id, message.role, message.content, message.created_at,
    );
  }
}
