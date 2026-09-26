import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Aperture, ArrowLeft, RotateCw } from "lucide-react";
import { useState } from "react";
import { createChat, type Chat, type Message } from "../../../api";
import { ChatComposer } from "../../../chat-composer";

export const Route = createFileRoute("/chat/new/")({ component: NewChatPage });

function NewChatPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const create = useMutation({
    mutationFn: createChat,
    onSuccess: ({ chat, user }) => {
      queryClient.setQueryData<Chat[]>(["chats"], (current = []) => [chat, ...current]);
      queryClient.setQueryData<Message[]>(["messages", chat.id], [user]);
      void navigate({ to: "/chat/$chatId", params: { chatId: chat.id } });
    },
    onError: (_error, content) => setDraft((current) => current || content),
  });

  function send() {
    const content = draft.trim();
    if (!content || create.isPending) return;
    setDraft("");
    create.mutate(content);
  }

  return (
    <main className="conversation-page">
      <div className="conversation-header">
        <div>
          <Link className="back-link" to="/"><ArrowLeft size={15} /> All conversations</Link>
          <h1>New conversation</h1>
          <div className="conversation-meta">Your first message will become the title.</div>
        </div>
        <div className="conversation-number">CHAT / NEW</div>
      </div>
      <div className="message-scroll">
        <div className="message-list">
          {create.isPending ? (
            <>
              <div className="message-row user">
                <div className="message-content">
                  <span className="message-author">YOU</span>
                  <div className="message-text">{create.variables}</div>
                </div>
              </div>
              <div className="thinking"><RotateCw size={15} className="spin" /> Saving your message...</div>
            </>
          ) : (
            <div className="empty-messages">
              <div className="empty-messages-icon"><Aperture size={29} /></div>
              <p className="eyebrow">A FRESH PAGE</p>
              <h2>Start anywhere.</h2>
              <p>Ask a question, share an idea, or just begin writing.</p>
            </div>
          )}
        </div>
      </div>
      <ChatComposer
        draft={draft}
        onDraftChange={setDraft}
        onSend={send}
        pending={create.isPending}
        autoFocus
        notice={create.isError ? "Message not sent. Please try again." : undefined}
      />
    </main>
  );
}
