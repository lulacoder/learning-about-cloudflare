import { createRootRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Aperture, ArrowUpRight, KeyRound, Menu, MessageCircle, Plus, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import { ApiError, listChats } from "../api";
import { useAuth } from "../auth";

export const Route = createRootRoute({ component: RootLayout });

function Brand() {
  return (
    <Link className="brand" to="/" aria-label="Stillroom home">
      <span className="brand-mark"><Aperture size={21} strokeWidth={1.8} /></span>
      <span>stillroom<span className="brand-dot">.</span></span>
    </Link>
  );
}

function ConnectScreen() {
  const { connect } = useAuth();
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [connecting, setConnecting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!input.trim()) return;
    setConnecting(true);
    setError("");
    try {
      await connect(input);
    } catch (cause) {
      setError(cause instanceof ApiError && cause.status === 401
        ? "That token was not accepted. Check CHAT_API_TOKEN in the project .env file."
        : "Could not reach the local Worker. Start it with bun run infra:dev, then try again.");
    } finally {
      setConnecting(false);
    }
  }

  return (
    <main className="connect-page">
      <div className="connect-grain" aria-hidden="true" />
      <div className="connect-top"><Brand /><span>PRIVATE PREVIEW / 01</span></div>
      <div className="connect-main">
        <div className="connect-copy">
          <span className="eyebrow"><span className="eyebrow-line" /> A quiet place for your thoughts</span>
          <h1>Good ideas need<br /><em>room to breathe.</em></h1>
          <p>Keep your conversations together, pick up where you left off, and think a little more clearly with an AI companion.</p>
          <div className="connect-orbit" aria-hidden="true"><span /><span /><span /></div>
        </div>
        <form className="connect-card" onSubmit={submit}>
          <span className="card-icon"><KeyRound size={23} strokeWidth={1.7} /></span>
          <p className="card-kicker">YOUR WORKSPACE</p>
          <h2>Open stillroom</h2>
          <p className="card-description">Enter the local preview token to connect to your chats.</p>
          <label htmlFor="token">Preview token</label>
          <input
            id="token"
            type="password"
            autoComplete="off"
            placeholder="Paste CHAT_API_TOKEN"
            value={input}
            onChange={(event) => setInput(event.target.value)}
          />
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="button button-primary connect-button" disabled={connecting || !input.trim()}>
            {connecting ? "Connecting..." : "Enter workspace"}
            <ArrowUpRight size={17} />
          </button>
          <p className="connect-help">For local use, start <code>bun run infra:dev</code> and use the token saved in <code>.env</code>.</p>
        </form>
      </div>
      <div className="connect-bottom"><span>BUILT FOR BETTER CONVERSATIONS</span><span>EST. 2026</span></div>
    </main>
  );
}

function Sidebar({ close }: { close: () => void }) {
  const { token, disconnect } = useAuth();
  const queryClient = useQueryClient();
  const chats = useQuery({ queryKey: ["chats"], queryFn: () => listChats(token) });

  function signOut() {
    queryClient.clear();
    disconnect();
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-top">
        <Brand />
        <button className="mobile-close icon-button" aria-label="Close menu" onClick={close}><X size={19} /></button>
      </div>
      <div className="sidebar-intro">YOUR THINKING SPACE</div>
      <Link className="new-chat" to="/chat/new" onClick={close}>
        <span className="new-chat-icon"><Plus size={18} /></span>
        <span>New conversation</span>
        <ArrowUpRight size={16} className="new-chat-arrow" />
      </Link>
      <div className="sidebar-section-header"><span>RECENT CHATS</span><span>{chats.data?.length ?? 0}</span></div>
      <nav className="chat-nav" aria-label="Recent chats">
        {chats.isLoading && <p className="sidebar-muted">Loading conversations...</p>}
        {chats.isError && <p className="sidebar-error" role="alert">Could not load chats. Check the Worker and token.</p>}
        {chats.data?.length === 0 && <p className="sidebar-muted">Your conversations will appear here.</p>}
        {chats.data?.map((chat) => (
          <Link
            key={chat.id}
            to="/chat/$chatId"
            params={{ chatId: chat.id }}
            className="chat-nav-link"
            activeProps={{ className: "chat-nav-link active" }}
            onClick={close}
          >
            <MessageCircle size={17} strokeWidth={1.7} />
            <span>{chat.title}</span>
          </Link>
        ))}
      </nav>
      <div className="sidebar-footer">
        <div className="sidebar-footer-mark"><Aperture size={18} /></div>
        <div><strong>Local preview</strong><small>Connected to your Worker</small></div>
        <button className="text-button" onClick={signOut} title="Change token">Change</button>
      </div>
    </aside>
  );
}

function RootLayout() {
  const { token } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  if (!token) return <ConnectScreen />;

  return (
    <div className="app-shell">
      {menuOpen && <button className="sidebar-backdrop" aria-label="Close menu" onClick={() => setMenuOpen(false)} />}
      <div className={`sidebar-wrap ${menuOpen ? "open" : ""}`}><Sidebar close={() => setMenuOpen(false)} /></div>
      <div className="main-panel">
        <header className="topbar">
          <button className="mobile-menu icon-button" aria-label="Open menu" onClick={() => setMenuOpen(true)}><Menu size={21} /></button>
          <div className="breadcrumb"><span>STILLROOM</span><span className="breadcrumb-separator">/</span><strong>{pathname === "/" ? "OVERVIEW" : "CONVERSATION"}</strong></div>
          <div className="topbar-status"><span className="status-dot" /> WORKSPACE ONLINE</div>
        </header>
        <Outlet />
      </div>
    </div>
  );
}
