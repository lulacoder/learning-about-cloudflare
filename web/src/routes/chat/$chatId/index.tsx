import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Aperture, ArrowLeft, MessageCircle, RotateCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ApiError, chatSocket, listChats, listMessages, sendMessage, type Chat, type Message } from "../../../api";
import { useAuth } from "../../../auth";
import { ChatComposer } from "../../../chat-composer";

export const Route = createFileRoute("/chat/$chatId/")({ component: ChatPage });

function addMessage(current: Message[] = [], message: Message): Message[] {
  if (current.some((item) => item.id === message.id)) return current;
  return [...current, message];
}

function ChatPage() {
  const { chatId } = Route.useParams();
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const [socketStatus, setSocketStatus] = useState<"connecting" | "live" | "offline">("connecting");
  const [notice, setNotice] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const chats = useQuery({ queryKey: ["chats"], queryFn: () => listChats(token) });
  const chat = chats.data?.find((item: Chat) => item.id === chatId);
  const messages = useQuery({
    queryKey: ["messages", chatId],
    queryFn: () => listMessages(token, chatId),
  });
  const send = useMutation({
    mutationFn: (content: string) => sendMessage(token, chatId, content),
    onSuccess: ({ user, assistant }) => {
      queryClient.setQueryData<Message[]>(["messages", chatId], (current) =>
        addMessage(addMessage(current, user), assistant),
      );
      setDraft("");
      setNotice("");
    },
    onError: (error) => {
      setNotice(error instanceof ApiError && error.status === 502
        ? "Your message was saved, but the assistant could not reply."
        : "Message not sent. Please try again.");
      if (error instanceof ApiError && error.status === 502) setDraft("");
    },
    onSettled: () => { void queryClient.invalidateQueries({ queryKey: ["messages", chatId] }); },
  });

  useEffect(() => {
    const savedNotice = queryClient.getQueryData<string>(["chat-notice", chatId]);
    if (savedNotice) {
      setNotice(savedNotice);
      queryClient.removeQueries({ queryKey: ["chat-notice", chatId], exact: true });
    }
  }, [chatId, queryClient]);

  useEffect(() => {
    let active = true;
    let socket: WebSocket | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;

    function connect() {
      setSocketStatus("connecting");
      socket = chatSocket(token, chatId);
      socket.addEventListener("open", () => {
        if (!active) return;
        setSocketStatus("live");
        void queryClient.invalidateQueries({ queryKey: ["messages", chatId] });
      });
      socket.addEventListener("message", (event) => {
        if (!active) return;
        try {
          const data: unknown = JSON.parse(String(event.data));
          if (typeof data !== "object" || data === null || !("type" in data)) return;
          if (data.type === "message" && "message" in data) {
            const message = data.message as Message;
            queryClient.setQueryData<Message[]>(["messages", chatId], (current) => addMessage(current, message));
          }
          if (data.type === "assistant_error") setNotice("The assistant could not reply. Your message is saved.");
        } catch { /* Ignore malformed socket events. */ }
      });
      socket.addEventListener("close", () => {
        if (!active) return;
        setSocketStatus("offline");
        timer = setTimeout(connect, 3000);
      });
    }

    connect();
    return () => {
      active = false;
      clearTimeout(timer);
      socket?.close();
    };
  }, [chatId, token, queryClient]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages.data?.length, send.isPending]);

  function submit() {
    const content = draft.trim();
    if (!content || send.isPending) return;
    send.mutate(content);
  }

  return (
    <main className="conversation-page">
      <div className="conversation-header">
        <div>
          <Link className="back-link" to="/"><ArrowLeft size={15} /> All conversations</Link>
          <h1>{chat?.title ?? "Conversation"}</h1>
          <div className="conversation-meta"><span className={`socket-indicator ${socketStatus}`} />{socketStatus === "live" ? "Live conversation" : socketStatus === "connecting" ? "Connecting..." : "Reconnecting..."}<span className="meta-divider">·</span>{messages.data?.length ?? 0} messages</div>
        </div>
        <div className="conversation-number">CHAT / {chatId.slice(0, 6).toUpperCase()}</div>
      </div>

      <div className="message-scroll">
        <div className="message-list">
          {messages.isLoading && <div className="loading-state"><RotateCw size={18} className="spin" /> Loading conversation...</div>}
          {messages.isError && <div className="empty-messages"><MessageCircle size={28} /><h2>We could not open this chat.</h2><p>Check the Worker and try refreshing the page.</p></div>}
          {messages.data?.length === 0 && <div className="empty-messages"><div className="empty-messages-icon"><Aperture size={29} /></div><p className="eyebrow">A FRESH PAGE</p><h2>Start anywhere.</h2><p>Ask a question, share an idea, or just begin writing.</p></div>}
          {messages.data?.map((message) => (
            <div className={`message-row ${message.role}`} key={message.id}>
              {message.role === "assistant" && <span className="assistant-avatar"><Aperture size={18} /></span>}
              <div className="message-content">
                <span className="message-author">{message.role === "assistant" ? "STILLROOM" : "YOU"}</span>
                <div className="message-text">{message.content}</div>
              </div>
            </div>
          ))}
          {send.isPending && <div className="thinking"><span className="thinking-dots"><i /><i /><i /></span> Thinking through your message...</div>}
          <div ref={bottomRef} />
        </div>
      </div>

      <ChatComposer draft={draft} onDraftChange={setDraft} onSend={submit} pending={send.isPending} notice={notice} onDismissNotice={() => setNotice("")} />
    </main>
  );
}
