"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type FormEvent, type PointerEvent } from "react";

type Character = {
  id: string;
  name: string;
  image: string | null;
  color: string;
};

type Reply = {
  id: string;
  author: string;
  text: string;
  time: string;
};

type Thread = {
  id: string;
  author: string;
  text: string;
  time: string;
  replies: Reply[];
  replyDraft: string;
  replyOpen: boolean;
  liked: boolean;
};

const characters: Character[] = [
  {
    id: "hades",
    name: "Hades",
    image: null,
    color: "lavender",
  },
  {
    id: "bob",
    name: "Bob",
    image: null,
    color: "mint",
  },
];

function createId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function createStarterThreads(characterId: string): Thread[] {
  const isHades = characterId === "hades";
  return [
    {
      id: `starter-${characterId}-1`,
      author: isHades ? "blueflamefan" : "creaturecomforts",
      text: isHades
        ? "Is the fast-talking confidence charming, or am I ignoring some obvious red flags?"
        : "Not to be dramatic, but Bob might be the most emotionally available monster ever.",
      time: "2h ago",
      replies: [
        {
          id: `starter-${characterId}-reply-1`,
          author: isHades ? "olympus_observer" : "teamblob",
          text: isHades ? "The banter is doing a lot of heavy lifting." : "And the optimism is kind of contagious.",
          time: "1h ago",
        },
      ],
      replyDraft: "",
      replyOpen: false,
      liked: false,
    },
    {
      id: `starter-${characterId}-2`,
      author: isHades ? "mythsnack" : "monsterwatcher",
      text: isHades
        ? "Blue fire hair is a look. I don't make the rules."
        : "One eye, zero bad vibes. That's a pretty great ratio.",
      time: "5h ago",
      replies: [],
      replyDraft: "",
      replyOpen: false,
      liked: false,
    },
  ];
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<"swipe" | "chats">("swipe");
  const [cardIndex, setCardIndex] = useState(0);
  const [matches, setMatches] = useState<Character[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pendingMatch, setPendingMatch] = useState<Character | null>(null);
  const [threadsByCharacter, setThreadsByCharacter] = useState<
    Record<string, Thread[]>
  >({});
  const [threadDraft, setThreadDraft] = useState("");
  const [dragOffset, setDragOffset] = useState(0);
  const dragStart = useRef<number | null>(null);

  const activeCharacter = characters[cardIndex];
  const selectedCharacter = matches.find((character) => character.id === selectedId);
  const selectedThreads = selectedCharacter
    ? threadsByCharacter[selectedCharacter.id] ?? []
    : [];

  useEffect(() => {
    if (!pendingMatch) return;

    const timer = window.setTimeout(() => {
      setMatches((current) =>
        current.some((character) => character.id === pendingMatch.id)
          ? current
          : [...current, pendingMatch],
      );
      setThreadsByCharacter((current) => ({
        ...current,
        [pendingMatch.id]: current[pendingMatch.id] ?? createStarterThreads(pendingMatch.id),
      }));
      setSelectedId(pendingMatch.id);
      setActiveTab("chats");
      setPendingMatch(null);
    }, 1450);

    return () => window.clearTimeout(timer);
  }, [pendingMatch]);

  function choose(direction: "left" | "right") {
    if (!activeCharacter || pendingMatch) return;
    setDragOffset(0);
    if (direction === "right") {
      setPendingMatch(activeCharacter);
    } else {
      setCardIndex((current) => current + 1);
    }
  }

  function handlePointerDown(event: PointerEvent<HTMLElement>) {
    if (pendingMatch) return;
    dragStart.current = event.clientX;
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: PointerEvent<HTMLElement>) {
    if (dragStart.current === null) return;
    setDragOffset(event.clientX - dragStart.current);
  }

  function handlePointerUp(event: PointerEvent<HTMLElement>) {
    if (dragStart.current === null) return;
    const distance = event.clientX - dragStart.current;
    dragStart.current = null;
    if (distance > 85) {
      choose("right");
    } else if (distance < -85) {
      choose("left");
    } else {
      setDragOffset(0);
    }
  }

  function addThread(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = threadDraft.trim();
    if (!text || !selectedCharacter) return;

    const thread: Thread = {
      id: createId(),
      author: "You",
      text,
      time: "just now",
      replies: [],
      replyDraft: "",
      replyOpen: false,
      liked: false,
    };
    setThreadsByCharacter((current) => ({
      ...current,
      [selectedCharacter.id]: [thread, ...(current[selectedCharacter.id] ?? [])],
    }));
    setThreadDraft("");
  }

  function updateThread(threadId: string, update: (thread: Thread) => Thread) {
    if (!selectedCharacter) return;
    setThreadsByCharacter((current) => ({
      ...current,
      [selectedCharacter.id]: (current[selectedCharacter.id] ?? []).map((thread) =>
        thread.id === threadId ? update(thread) : thread,
      ),
    }));
  }

  function addReply(event: FormEvent<HTMLFormElement>, thread: Thread) {
    event.preventDefault();
    const text = thread.replyDraft.trim();
    if (!text) return;
    updateThread(thread.id, (current) => ({
      ...current,
      replies: [...current.replies, { id: createId(), author: "You", text, time: "just now" }],
      replyDraft: "",
      replyOpen: false,
    }));
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand" aria-label="Crush Club home">
          <span className="brand-mark">C</span>
          <span>crush club<span className="brand-period">.</span></span>
        </div>

        <div className="sidebar-label">YOUR SPACE</div>
        <nav className="main-nav" aria-label="Main navigation">
          <button
            className={`nav-item ${activeTab === "swipe" ? "selected" : ""}`}
            onClick={() => setActiveTab("swipe")}
          >
            <span className="nav-icon swipe-icon">↗</span>
            <span>Discover</span>
            <span className="nav-count">{Math.max(characters.length - cardIndex, 0)}</span>
          </button>
          <button
            className={`nav-item ${activeTab === "chats" ? "selected" : ""}`}
            onClick={() => setActiveTab("chats")}
          >
            <span className="nav-icon chat-icon">◌</span>
            <span>Chats</span>
            {matches.length > 0 && <span className="nav-count">{matches.length}</span>}
          </button>
        </nav>

        <div className="sidebar-bottom">
          <div className="daily-card">
            <span className="daily-spark">✳</span>
            <p className="daily-title">Your type is showing.</p>
            <p className="daily-copy">Two iconic characters. One very important decision.</p>
          </div>
          <div className="profile-row">
            <div className="profile-avatar">Y</div>
            <div className="profile-copy"><strong>You</strong><span>Professional swiper</span></div>
            <span className="profile-menu">···</span>
          </div>
        </div>
      </aside>

      <section className="main-column">
        <header className="topbar">
          <div className="mobile-brand"><span className="brand-mark">C</span> crush club<span className="brand-period">.</span></div>
          <div className="breadcrumbs">
            <span>YOUR SPACE</span><span className="crumb-slash">/</span>
            <strong>{activeTab === "swipe" ? "DISCOVER" : "CHATS"}</strong>
          </div>
          <div className="topbar-right">
            <span className="online-dot" /> ALL SYSTEMS FLIRTING
          </div>
        </header>

        {activeTab === "swipe" ? (
          <section className="discover-view" aria-label="Discover characters">
            <div className="section-heading">
              <div>
                <div className="eyebrow"><span className="eyebrow-line" /> THE CHARACTER LINEUP</div>
                <h1>Is it a crush<br className="mobile-break" /> or a <span>pass?</span></h1>
                <p className="section-subtitle">Trust your gut. The group chat will understand.</p>
              </div>
              <div className="card-counter">
                <span className="counter-current">{activeCharacter ? String(cardIndex + 1).padStart(2, "0") : "00"}</span>
                <span className="counter-divider">/</span>
                <span>{String(characters.length).padStart(2, "0")}</span>
              </div>
            </div>

            <div className="swipe-stage">
              <div className="stage-decoration stage-decoration-left">✳</div>
              <div className="stage-decoration stage-decoration-right">✦</div>
              {activeCharacter ? (
                <div className="card-stack">
                  <div className="back-card back-card-two" />
                  <div className="back-card back-card-one" />
                  <article
                    className={`character-card ${pendingMatch ? "card-matching" : ""}`}
                    style={{ transform: `translateX(${dragOffset}px) rotate(${dragOffset * 0.045}deg)` }}
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={() => { dragStart.current = null; setDragOffset(0); }}
                    aria-label={`${activeCharacter.name} character card`}
                  >
                    <div className={`portrait portrait-${activeCharacter.color}`}>
                      {activeCharacter.image ? (
                        <Image
                          src={activeCharacter.image}
                          alt={`${activeCharacter.name} portrait`}
                          fill
                          priority
                          sizes="(max-width: 700px) 84vw, 390px"
                          draggable={false}
                        />
                      ) : (
                        <div className="photo-placeholder" role="img" aria-label="Portrait not provided">
                          <span>▧</span>
                        </div>
                      )}
                    </div>
                    <div className="card-details">
                      <h2>{activeCharacter.name}</h2>
                    </div>
                    <div className={`swipe-stamp ${dragOffset > 35 ? "stamp-smash" : ""} ${dragOffset < -35 ? "stamp-pass" : ""}`}>
                      {dragOffset > 35 ? "SMASH" : dragOffset < -35 ? "PASS" : ""}
                    </div>
                  </article>
                  {pendingMatch && (
                    <div className="match-overlay" role="status" aria-live="polite">
                      <div className="match-burst"><span>♥</span></div>
                      <p className="match-kicker">THE FEELING IS MUTUAL</p>
                      <h2>It&apos;s a match!</h2>
                      <p>You and {pendingMatch.name} are about to get along.</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="empty-deck">
                  <div className="empty-heart">♡</div>
                  <p className="eyebrow">YOU&apos;RE ALL CAUGHT UP</p>
                  <h2>The lineup is looking a little empty.</h2>
                  <p>That&apos;s the whole roster for now. Come back when the next crush drops.</p>
                  <button className="outline-button" onClick={() => setCardIndex(0)}>↻ &nbsp; Start over</button>
                </div>
              )}
            </div>

            {activeCharacter && (
              <div className="swipe-controls">
                <button className="choice-button pass-button" onClick={() => choose("left")} disabled={!!pendingMatch} aria-label="Pass on this character">
                  <span className="choice-icon">×</span>
                </button>
                <span className="swipe-hint"><span className="hint-arrow">←</span> SWIPE TO DECIDE <span className="hint-arrow">→</span></span>
                <button className="choice-button smash-button" onClick={() => choose("right")} disabled={!!pendingMatch} aria-label="Smash on this character">
                  <span className="choice-icon">♥</span>
                </button>
              </div>
            )}
            <div className="stage-footnote"><span>✦</span> No judgment. Okay, maybe a little. <span>✦</span></div>
          </section>
        ) : (
          <section className="chats-view" aria-label="Character chats">
            <div className="chats-heading">
              <div>
                <div className="eyebrow"><span className="eyebrow-line" /> YOUR CONNECTIONS</div>
                <h1>It&apos;s a <span>match.</span></h1>
                <p className="section-subtitle">Good taste deserves a good conversation.</p>
              </div>
              <div className="chat-total"><strong>{String(matches.length).padStart(2, "0")}</strong><span>CONNECTIONS</span></div>
            </div>

            {matches.length === 0 ? (
              <div className="no-matches">
                <div className="empty-heart">♡</div>
                <div className="eyebrow">YOUR INBOX IS WAITING</div>
                <h2>No matches just yet.</h2>
                <p>When someone catches your eye, your chat will show up here.</p>
                <button className="primary-button" onClick={() => setActiveTab("swipe")}>Meet the lineup <span>↗</span></button>
              </div>
            ) : (
              <div className="chat-workspace">
                <aside className="match-list">
                  <div className="list-heading">YOUR MATCHES <span>{matches.length}</span></div>
                  {matches.map((character) => (
                    <button
                      key={character.id}
                      className={`match-row ${selectedId === character.id ? "match-row-selected" : ""}`}
                      onClick={() => { setSelectedId(character.id); setThreadDraft(""); }}
                    >
                      <span className={`match-avatar avatar-${character.color}`}>
                        {character.image ? <Image src={character.image} alt="" fill sizes="48px" /> : <span className="avatar-placeholder">▧</span>}
                        <i />
                      </span>
                      <span className="match-row-copy"><strong>{character.name}</strong><span>Your new connection</span></span>
                      <span className="match-chevron">›</span>
                    </button>
                  ))}
                  <button className="find-more" onClick={() => setActiveTab("swipe")}><span>＋</span> Find more characters</button>
                </aside>

                {selectedCharacter ? (
                  <div className="thread-panel">
                    <header className="thread-header">
                      <div className={`thread-avatar avatar-${selectedCharacter.color}`}>
                        {selectedCharacter.image ? <Image src={selectedCharacter.image} alt="" fill sizes="52px" /> : <span className="avatar-placeholder">▧</span>}
                      </div>
                      <div className="thread-title"><h2>{selectedCharacter.name}</h2><p><span className="online-dot" /> MATCHED JUST NOW</p></div>
                      <button className="more-button" aria-label="More chat options">···</button>
                    </header>
                    <div className="community-intro">
                      <div className="community-icon">✳</div>
                      <div><h3>Your little corner of the internet.</h3><p>Start a thread, share a thought, or jump into the conversation.</p></div>
                    </div>
                    <form className="thread-composer" onSubmit={addThread}>
                      <div className="composer-avatar">Y</div>
                      <div className="composer-content">
                        <textarea
                          value={threadDraft}
                          onChange={(event) => setThreadDraft(event.target.value)}
                          placeholder={`Start a thread about ${selectedCharacter.name}...`}
                          aria-label={`Start a thread about ${selectedCharacter.name}`}
                          maxLength={500}
                          rows={2}
                        />
                        <div className="composer-footer">
                          <span>Be kind. Be interesting.</span>
                          <button type="submit" className="post-button" disabled={!threadDraft.trim()}>Post <span>↗</span></button>
                        </div>
                      </div>
                    </form>

                    <div className="discussion-heading"><span>THE DISCUSSION</span><span>{selectedThreads.length} {selectedThreads.length === 1 ? "THREAD" : "THREADS"}</span></div>
                    <div className="thread-feed">
                      {selectedThreads.length === 0 ? (
                        <div className="feed-empty"><div>✎</div><p>No threads yet. You could be the first.</p></div>
                      ) : selectedThreads.map((thread) => (
                        <article className="thread-card" key={thread.id}>
                          <div className="thread-user-avatar">Y</div>
                          <div className="thread-body">
                            <div className="thread-meta"><strong>{thread.author}</strong><span>·</span><span>{thread.time}</span></div>
                            <p className="thread-text">{thread.text}</p>
                            <div className="thread-actions">
                              <button className={thread.liked ? "action-liked" : ""} onClick={() => updateThread(thread.id, (current) => ({ ...current, liked: !current.liked }))} aria-label={thread.liked ? "Unlike thread" : "Like thread"}>
                                <span>{thread.liked ? "♥" : "♡"}</span> {thread.liked ? "1" : "Like"}
                              </button>
                              <button onClick={() => updateThread(thread.id, (current) => ({ ...current, replyOpen: !current.replyOpen }))}>
                                <span>↩</span> Reply {thread.replies.length > 0 && `· ${thread.replies.length}`}
                              </button>
                            </div>
                            {thread.replies.map((reply) => (
                              <div className="reply-row" key={reply.id}>
                                <div className="reply-avatar">Y</div>
                                <div><div className="thread-meta"><strong>{reply.author}</strong><span>·</span><span>{reply.time}</span></div><p>{reply.text}</p></div>
                              </div>
                            ))}
                            {thread.replyOpen && (
                              <form className="reply-form" onSubmit={(event) => addReply(event, thread)}>
                                <input
                                  value={thread.replyDraft}
                                  onChange={(event) => updateThread(thread.id, (current) => ({ ...current, replyDraft: event.target.value }))}
                                  placeholder="Write a reply..."
                                  aria-label="Write a reply"
                                  maxLength={300}
                                />
                                <button type="submit" disabled={!thread.replyDraft.trim()}>Reply</button>
                              </form>
                            )}
                          </div>
                        </article>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="select-match-prompt">Choose a match to open the conversation.</div>
                )}
              </div>
            )}
          </section>
        )}
      </section>

      <nav className="mobile-nav" aria-label="Mobile navigation">
        <button className={activeTab === "swipe" ? "mobile-nav-active" : ""} onClick={() => setActiveTab("swipe")}><span>↗</span>Discover</button>
        <button className={activeTab === "chats" ? "mobile-nav-active" : ""} onClick={() => setActiveTab("chats")}><span>◌</span>Chats{matches.length > 0 && <i>{matches.length}</i>}</button>
      </nav>
    </main>
  );
}
