import { ArrowUp } from "lucide-react";
import { type FormEvent, type KeyboardEvent } from "react";

type Props = {
  draft: string;
  onDraftChange: (draft: string) => void;
  onSend: () => void;
  pending: boolean;
  autoFocus?: boolean;
  notice?: string;
  onDismissNotice?: () => void;
};

export function ChatComposer({ draft, onDraftChange, onSend, pending, autoFocus, notice, onDismissNotice }: Props) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSend();
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      onSend();
    }
  }

  return (
    <div className="composer-area">
      {notice && <div className="chat-notice" role="alert">{notice}<button onClick={onDismissNotice} aria-label="Dismiss">×</button></div>}
      <form className="composer" onSubmit={submit}>
        <textarea
          aria-label="Message"
          autoFocus={autoFocus}
          placeholder="Write a message..."
          rows={2}
          maxLength={10_000}
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={onKeyDown}
        />
        <button type="submit" className="send-button" disabled={!draft.trim() || pending} aria-label="Send message"><ArrowUp size={20} /></button>
      </form>
      <div className="composer-caption"><span>PRESS ENTER TO SEND · SHIFT + ENTER FOR A NEW LINE</span><span>POWERED BY WORKERS AI</span></div>
    </div>
  );
}
