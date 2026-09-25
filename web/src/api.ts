export type Chat = { id: string; title: string; created_at: number };
export type Message = {
  id: string;
  chat_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: number;
};

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    credentials: "same-origin",
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401) window.location.assign("/login");
    const message =
      typeof data === "object" && data !== null && "error" in data &&
      typeof data.error === "string"
        ? data.error
        : `Request failed (${response.status})`;
    throw new ApiError(message, response.status);
  }
  return data as T;
}

export async function listChats(): Promise<Chat[]> {
  return (await request<{ chats: Chat[] }>("/chats")).chats;
}

export async function createChat(content: string) {
  return request<{ chat: Chat; user: Message; assistant: Message | null }>("/chats", {
    method: "POST",
    body: JSON.stringify({ content }),
  });
}

export async function listMessages(chatId: string): Promise<Message[]> {
  return (await request<{ messages: Message[] }>(
    `/chats/${encodeURIComponent(chatId)}/messages`,
  )).messages;
}

export async function sendMessage(chatId: string, content: string) {
  return request<{ user: Message; assistant: Message }>(
    `/chats/${encodeURIComponent(chatId)}/messages`,
    { method: "POST", body: JSON.stringify({ content }) },
  );
}

export function chatSocket(chatId: string): WebSocket {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const url = `${protocol}//${window.location.host}/api/chats/${encodeURIComponent(chatId)}/socket`;
  return new WebSocket(url, ["chat"]);
}
