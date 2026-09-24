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

async function request<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      typeof data === "object" && data !== null && "error" in data &&
      typeof data.error === "string"
        ? data.error
        : `Request failed (${response.status})`;
    throw new ApiError(message, response.status);
  }
  return data as T;
}

export async function listChats(token: string): Promise<Chat[]> {
  return (await request<{ chats: Chat[] }>("/chats", token)).chats;
}

export async function createChat(token: string, title: string): Promise<Chat> {
  return (await request<{ chat: Chat }>("/chats", token, {
    method: "POST",
    body: JSON.stringify({ title }),
  })).chat;
}

export async function listMessages(token: string, chatId: string): Promise<Message[]> {
  return (await request<{ messages: Message[] }>(
    `/chats/${encodeURIComponent(chatId)}/messages`, token,
  )).messages;
}

export async function sendMessage(token: string, chatId: string, content: string) {
  return request<{ user: Message; assistant: Message }>(
    `/chats/${encodeURIComponent(chatId)}/messages`, token,
    { method: "POST", body: JSON.stringify({ content }) },
  );
}

export function chatSocket(token: string, chatId: string): WebSocket {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const url = `${protocol}//${window.location.host}/api/chats/${encodeURIComponent(chatId)}/socket`;
  return new WebSocket(url, ["chat", `token.${token}`]);
}
