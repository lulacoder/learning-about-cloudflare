import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Aperture, ArrowUpRight, LockKeyhole } from "lucide-react";
import { useState, type FormEvent } from "react";
import { authClient } from "./auth-client";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const signingUp = mode === "signup";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const result = signingUp
        ? await authClient.signUp.email({ name: name.trim(), email: email.trim(), password })
        : await authClient.signIn.email({ email: email.trim(), password });
      if (result.error) {
        setError(result.error.message ?? "Could not continue. Please try again.");
        return;
      }
      queryClient.clear();
      await navigate({ to: "/" });
    } catch {
      setError("Could not reach the Worker. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="connect-page">
      <div className="connect-grain" aria-hidden="true" />
      <div className="connect-top">
        <Link className="brand" to="/" aria-label="Stillroom home">
          <span className="brand-mark"><Aperture size={21} strokeWidth={1.8} /></span>
          <span>stillroom<span className="brand-dot">.</span></span>
        </Link>
        <span>YOUR SPACE TO THINK</span>
      </div>
      <div className="connect-main">
        <div className="connect-copy">
          <span className="eyebrow"><span className="eyebrow-line" /> A quiet place for your thoughts</span>
          <h1>Good ideas need<br /><em>room to breathe.</em></h1>
          <p>Keep your conversations together, pick up where you left off, and think a little more clearly with an AI companion.</p>
          <div className="connect-orbit" aria-hidden="true"><span /><span /><span /></div>
        </div>
        <form className="connect-card" onSubmit={(event) => void submit(event)}>
          <span className="card-icon"><LockKeyhole size={23} strokeWidth={1.7} /></span>
          <p className="card-kicker">YOUR WORKSPACE</p>
          <h2>{signingUp ? "Make some room" : "Welcome back"}</h2>
          <p className="card-description">
            {signingUp ? "Create an account to save your conversations." : "Sign in to return to your conversations."}
          </p>
          {signingUp && <>
            <label htmlFor="name">Name</label>
            <input id="name" type="text" autoComplete="name" required maxLength={100} value={name} onChange={(event) => setName(event.target.value)} placeholder="Your name" />
          </>}
          <label htmlFor="email">Email</label>
          <input id="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" />
          <label htmlFor="password">Password</label>
          <input id="password" type="password" autoComplete={signingUp ? "new-password" : "current-password"} required minLength={signingUp ? 8 : undefined} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={signingUp ? "At least 8 characters" : "Your password"} />
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="button button-primary connect-button" disabled={pending}>
            {pending ? "Please wait..." : signingUp ? "Create account" : "Sign in"}
            <ArrowUpRight size={17} />
          </button>
          <p className="auth-switch">
            {signingUp ? "Already have an account? " : "New to Stillroom? "}
            <Link to={signingUp ? "/login" : "/signup"}>{signingUp ? "Sign in" : "Create an account"}</Link>
          </p>
        </form>
      </div>
      <div className="connect-bottom"><span>BUILT FOR BETTER CONVERSATIONS</span><span>EST. 2026</span></div>
    </main>
  );
}
