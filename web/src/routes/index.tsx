import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Lightbulb, PenLine, Sparkles } from "lucide-react";

export const Route = createFileRoute("/")({ component: HomePage });

const starters = [
  { icon: Lightbulb, title: "Explore an idea", detail: "Follow a question wherever it leads." },
  { icon: PenLine, title: "Shape a draft", detail: "Find the words you are looking for." },
  { icon: Sparkles, title: "Learn something", detail: "Make a difficult topic feel simple." },
];

function HomePage() {
  return (
    <main className="home-page">
      <div className="home-orbit" aria-hidden="true"><span /><span /></div>
      <div className="home-content">
        <p className="eyebrow"><span className="eyebrow-line" /> THE START OF SOMETHING</p>
        <h1>What’s on<br /><em>your mind?</em></h1>
        <p className="home-lead">A little space to ask, make, and figure things out. Start a conversation and see where it goes.</p>
        <div className="starter-label">PICK A PLACE TO BEGIN <span>↓</span></div>
        <div className="starter-grid">
          {starters.map(({ icon: Icon, title, detail }, index) => (
            <Link key={title} className="starter-card" to="/chat/new">
              <span className="starter-index">0{index + 1}</span>
              <Icon size={25} strokeWidth={1.55} />
              <strong>{title}</strong>
              <small>{detail}</small>
              <ArrowRight size={17} className="starter-arrow" />
            </Link>
          ))}
        </div>
      </div>
      <div className="home-footnote"><span>01 / OPEN A CONVERSATION</span><span>THE REST IS UP TO YOU</span></div>
    </main>
  );
}
