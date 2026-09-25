import { createRootRoute, Link, Navigate, Outlet, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Aperture, ArrowUpRight, Menu, MessageCircle, Plus, X } from "lucide-react";
import { useState } from "react";
import { listChats } from "../api";
import { authClient } from "../auth-client";

export const Route = createRootRoute({ component: RootLayout });

function Brand() {
  return (
    <Link className="brand" to="/" aria-label="Stillroom home">
      <span className="brand-mark"><Aperture size={21} strokeWidth={1.8} /></span>
      <span>stillroom<span className="brand-dot">.</span></span>
    </Link>
  );
}

function Sidebar({ close, name }: { close: () => void; name: string }) {
  const queryClient = useQueryClient();
  const chats = useQuery({ queryKey: ["chats"], queryFn: listChats });

  async function signOut() {
    const result = await authClient.signOut();
    if (!result.error) queryClient.clear();
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
        {chats.isError && <p className="sidebar-error" role="alert">Could not load chats. Try refreshing the page.</p>}
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
        <div><strong>{name}</strong><small>Signed in</small></div>
        <button className="text-button" onClick={() => void signOut()} title="Sign out">Sign out</button>
      </div>
    </aside>
  );
}

function RootLayout() {
  const { data: session, isPending } = authClient.useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const isAuthPage = pathname === "/login" || pathname === "/signup" || pathname === "/login/" || pathname === "/signup/";

  if (isPending) return <main className="auth-loading">Opening Stillroom...</main>;
  if (!session) return isAuthPage ? <Outlet /> : <Navigate to="/login" />;
  if (isAuthPage) return <Navigate to="/" />;

  return (
    <div className="app-shell">
      {menuOpen && <button className="sidebar-backdrop" aria-label="Close menu" onClick={() => setMenuOpen(false)} />}
      <div className={`sidebar-wrap ${menuOpen ? "open" : ""}`}>
        <Sidebar close={() => setMenuOpen(false)} name={session.user.name} />
      </div>
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
