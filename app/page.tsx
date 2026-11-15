"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type FormEvent, type PointerEvent } from "react";
import type { CommentPage, CommentRecord, CommentVote, GuestIdentity } from "@/lib/comments";

type Character = {
  id: string;
  name: string;
  image: string | null;
  color: string;
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

type CommentItemProps = {
  comment: CommentRecord;
  childrenByParent: Map<string, CommentRecord[]>;
  username: string;
  votingCommentIds: Set<string>;
  onCreateReply: (parent: CommentRecord, text: string) => Promise<boolean>;
  onVote: (comment: CommentRecord, vote: Exclude<CommentVote, null>) => void;
};

function formatCommentTime(value: string) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "just now";
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(value).toLocaleDateString();
}

function CommentItem({
  comment,
  childrenByParent,
  username,
  votingCommentIds,
  onCreateReply,
  onVote,
}: CommentItemProps) {
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyDraft, setReplyDraft] = useState("");
  const [replyPending, setReplyPending] = useState(false);
  const replies = childrenByParent.get(comment.id) ?? [];

  async function submitReply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = replyDraft.trim();
    if (!text || replyPending) return;

    setReplyPending(true);
    if (await onCreateReply(comment, text)) {
      setReplyDraft("");
      setReplyOpen(false);
    }
    setReplyPending(false);
  }

  return (
    <article className="comment-node">
      <div className="thread-card">
        <div className="thread-user-avatar">{comment.username.slice(0, 1).toUpperCase()}</div>
        <div className="thread-body">
          <div className="thread-meta"><strong>{comment.username}</strong><span>·</span><span>{formatCommentTime(comment.createdAt)}</span></div>
          <p className="thread-text">{comment.text}</p>
          <div className="thread-actions">
            <button
              className={comment.myVote === "like" ? "action-liked" : ""}
              onClick={() => onVote(comment, "like")}
              disabled={votingCommentIds.has(comment.id)}
              aria-label={comment.myVote === "like" ? "Remove like" : "Like comment"}
              aria-pressed={comment.myVote === "like"}
            >
              <span>▲</span> {comment.likes}
            </button>
            <button
              className={comment.myVote === "dislike" ? "action-disliked" : ""}
              onClick={() => onVote(comment, "dislike")}
              disabled={votingCommentIds.has(comment.id)}
              aria-label={comment.myVote === "dislike" ? "Remove dislike" : "Dislike comment"}
              aria-pressed={comment.myVote === "dislike"}
            >
              <span>▼</span> {comment.dislikes}
            </button>
            <button onClick={() => setReplyOpen((current) => !current)} aria-expanded={replyOpen}>
              <span>↩</span> Reply
            </button>
          </div>
          {replyOpen && (
            <form className="reply-form" onSubmit={submitReply}>
              <span className="reply-avatar">{username.slice(0, 1).toUpperCase()}</span>
              <input
                value={replyDraft}
                onChange={(event) => setReplyDraft(event.target.value)}
                placeholder={`Reply as ${username || "Guest"}...`}
                aria-label={`Reply to ${comment.username}`}
                maxLength={1000}
                autoFocus
              />
              <button type="submit" disabled={!replyDraft.trim() || !username.trim() || replyPending}>Reply</button>
            </form>
          )}
        </div>
      </div>
      {replies.length > 0 && (
        <div className="comment-children">
          {replies.map((reply) => (
            <CommentItem
              key={reply.id}
              comment={reply}
              childrenByParent={childrenByParent}
              username={username}
              votingCommentIds={votingCommentIds}
              onCreateReply={onCreateReply}
              onVote={onVote}
            />
          ))}
        </div>
      )}
    </article>
  );
}

async function getApiError(response: Response) {
  try {
    const body: unknown = await response.json();
    if (
      typeof body === "object" &&
      body !== null &&
      "error" in body &&
      typeof body.error === "string"
    ) {
      return body.error;
    }
  } catch {
    return `The request failed (${response.status}).`;
  }
  return `The request failed (${response.status}).`;
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<"swipe" | "chats">("swipe");
  const [cardIndex, setCardIndex] = useState(0);
  const [matches, setMatches] = useState<Character[]>([]);
  const [matchesLoaded, setMatchesLoaded] = useState(false);
  const [guestIdentity, setGuestIdentity] = useState<GuestIdentity | null>(null);
  const [storageWarning, setStorageWarning] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pendingMatch, setPendingMatch] = useState<Character | null>(null);
  const [comments, setComments] = useState<CommentRecord[]>([]);
  const [commentCursor, setCommentCursor] = useState<string | null>(null);
  const [hasMoreComments, setHasMoreComments] = useState(false);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [loadingMoreComments, setLoadingMoreComments] = useState(false);
  const [submittingComment, setSubmittingComment] = useState(false);
  const [commentError, setCommentError] = useState("");
  const [votingCommentIds, setVotingCommentIds] = useState<Set<string>>(new Set());
  const [threadDraft, setThreadDraft] = useState("");
  const [dragOffset, setDragOffset] = useState(0);
  const dragStart = useRef<number | null>(null);

  const activeCharacter = characters[cardIndex];
  const selectedCharacter = matches.find((character) => character.id === selectedId);
  const childrenByParent = new Map<string, CommentRecord[]>();
  const roots: CommentRecord[] = [];
  for (const comment of comments) {
    if (comment.parentId) {
      const siblings = childrenByParent.get(comment.parentId) ?? [];
      siblings.push(comment);
      childrenByParent.set(comment.parentId, siblings);
    } else {
      roots.push(comment);
    }
  }
  roots.sort((first, second) => second.createdAt.localeCompare(first.createdAt));
  for (const replies of childrenByParent.values()) {
    replies.sort((first, second) => first.createdAt.localeCompare(second.createdAt));
  }

  useEffect(() => {
    const userId = crypto.randomUUID();
    let identity: GuestIdentity = {
      userId,
      username: `Guest-${userId.slice(0, 5)}`,
    };

    try {
      const storedIdentity = localStorage.getItem("smash-or-pass:guest");
      if (storedIdentity) {
        const parsed: unknown = JSON.parse(storedIdentity);
        if (
          typeof parsed === "object" &&
          parsed !== null &&
          "userId" in parsed &&
          typeof parsed.userId === "string" &&
          /^[\da-f]{8}-[\da-f]{4}-[1-8][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(parsed.userId) &&
          "username" in parsed &&
          typeof parsed.username === "string"
        ) {
          identity = {
            userId: parsed.userId,
            username: parsed.username.slice(0, 24),
          };
        }
      }

      const storedMatches = localStorage.getItem("smash-or-pass:matches");
      if (storedMatches) {
        const parsed: unknown = JSON.parse(storedMatches);
        if (Array.isArray(parsed)) {
          const ids = parsed.filter(
            (id): id is string => typeof id === "string" && characters.some((character) => character.id === id),
          );
          const savedMatches = characters.filter((character) => ids.includes(character.id));
          setMatches(savedMatches);
          setSelectedId(savedMatches[0]?.id ?? null);
        } else {
          setStorageWarning("Saved matches could not be read; your new matches will still be saved.");
        }
      }
    } catch (error) {
      console.error("Could not read the guest profile from browser storage.", error);
      setStorageWarning("Browser storage is unavailable. Your guest name and matches may not persist.");
    }

    setGuestIdentity(identity);
    setMatchesLoaded(true);
  }, []);

  useEffect(() => {
    if (!guestIdentity || !matchesLoaded) return;
    try {
      localStorage.setItem("smash-or-pass:guest", JSON.stringify(guestIdentity));
      localStorage.setItem(
        "smash-or-pass:matches",
        JSON.stringify(matches.map((character) => character.id)),
      );
    } catch (error) {
      console.error("Could not save the guest profile to browser storage.", error);
      setStorageWarning("Browser storage is unavailable. Your guest name and matches may not persist.");
    }
  }, [guestIdentity, matches, matchesLoaded]);

  useEffect(() => {
    if (!selectedCharacter || !guestIdentity) return;
    const characterId = selectedCharacter.id;
    const voterId = guestIdentity.userId;

    const controller = new AbortController();
    async function loadComments() {
      setComments([]);
      setCommentCursor(null);
      setHasMoreComments(false);
      setCommentError("");
      setCommentsLoading(true);
      try {
        const query = new URLSearchParams({ characterId, voterId });
        const response = await fetch(`/api/comments?${query}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(await getApiError(response));
        const page = (await response.json()) as CommentPage;
        setComments(page.comments);
        setCommentCursor(page.nextCursor);
        setHasMoreComments(page.nextCursor !== null);
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;
        console.error("Could not load character comments.", error);
        setCommentError(error instanceof Error ? error.message : "Comments could not be loaded.");
      } finally {
        if (!controller.signal.aborted) setCommentsLoading(false);
      }
    }

    void loadComments();
    return () => controller.abort();
  }, [selectedCharacter?.id, guestIdentity?.userId]);

  useEffect(() => {
    if (!pendingMatch) return;

    const timer = window.setTimeout(() => {
      setMatches((current) =>
        current.some((character) => character.id === pendingMatch.id)
          ? current
          : [...current, pendingMatch],
      );
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

  async function createComment(parent: CommentRecord | null, text: string) {
    const character = selectedCharacter;
    const identity = guestIdentity;
    if (!character || !identity || !text.trim() || submittingComment) return false;

    setSubmittingComment(true);
    setCommentError("");
    try {
      const response = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          characterId: character.id,
          username: identity.username.trim(),
          userId: identity.userId,
          text: text.trim(),
          parentId: parent?.id ?? null,
          parentTimestamp: parent?.timestamp ?? null,
        }),
      });
      if (!response.ok) throw new Error(await getApiError(response));
      const result = (await response.json()) as { comment: CommentRecord };
      setComments((current) =>
        selectedId === character.id ? [...current, result.comment] : current,
      );
      if (!parent) setThreadDraft("");
      return true;
    } catch (error) {
      console.error("Could not save comment.", error);
      setCommentError(error instanceof Error ? error.message : "Your comment could not be saved.");
      return false;
    } finally {
      setSubmittingComment(false);
    }
  }

  async function submitThread(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await createComment(null, threadDraft);
  }

  async function loadMoreComments() {
    if (!selectedCharacter || !guestIdentity || !commentCursor || loadingMoreComments) return;

    setLoadingMoreComments(true);
    setCommentError("");
    try {
      const query = new URLSearchParams({
        characterId: selectedCharacter.id,
        voterId: guestIdentity.userId,
        cursor: commentCursor,
      });
      const response = await fetch(`/api/comments?${query}`, { cache: "no-store" });
      if (!response.ok) throw new Error(await getApiError(response));
      const page = (await response.json()) as CommentPage;
      setComments((current) => {
        const knownIds = new Set(current.map((comment) => comment.id));
        return [
          ...current,
          ...page.comments.filter((comment) => !knownIds.has(comment.id)),
        ];
      });
      setCommentCursor(page.nextCursor);
      setHasMoreComments(page.nextCursor !== null);
    } catch (error) {
      console.error("Could not load more comments.", error);
      setCommentError(error instanceof Error ? error.message : "More comments could not be loaded.");
    } finally {
      setLoadingMoreComments(false);
    }
  }

  async function voteOnComment(
    comment: CommentRecord,
    vote: Exclude<CommentVote, null>,
  ) {
    if (!selectedCharacter || !guestIdentity || votingCommentIds.has(comment.id)) return;
    const characterId = selectedCharacter.id;
    const nextVote = comment.myVote === vote ? null : vote;
    setVotingCommentIds((current) => new Set(current).add(comment.id));
    setCommentError("");

    try {
      const response = await fetch("/api/comments", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          characterId,
          commentId: comment.id,
          commentTimestamp: comment.timestamp,
          voterId: guestIdentity.userId,
          vote: nextVote,
        }),
      });
      if (!response.ok) throw new Error(await getApiError(response));
      const result = (await response.json()) as {
        likes: number;
        dislikes: number;
        myVote: CommentVote;
      };
      setComments((current) =>
        selectedId === characterId
          ? current.map((item) =>
              item.id === comment.id
                ? { ...item, likes: result.likes, dislikes: result.dislikes, myVote: result.myVote }
                : item,
            )
          : current,
      );
    } catch (error) {
      console.error("Could not save comment vote.", error);
      setCommentError(error instanceof Error ? error.message : "Your vote could not be saved.");
    } finally {
      setVotingCommentIds((current) => {
        const next = new Set(current);
        next.delete(comment.id);
        return next;
      });
    }
  }

  function changeUsername(username: string) {
    setGuestIdentity((current) => (current ? { ...current, username } : current));
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
            <div className="profile-avatar">{guestIdentity?.username.slice(0, 1).toUpperCase() ?? "G"}</div>
            <div className="profile-copy"><strong>{guestIdentity?.username || "Guest"}</strong><span>Guest profile</span></div>
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

            {!matchesLoaded ? (
              <div className="no-matches"><p>Loading your chats...</p></div>
            ) : matches.length === 0 ? (
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
                      <div><h3>Your little corner of the internet.</h3><p>Post a thought or reply to a comment. Anyone can join in.</p></div>
                    </div>
                    <form className="thread-composer" onSubmit={submitThread}>
                      <div className="composer-avatar">{guestIdentity?.username.slice(0, 1).toUpperCase() ?? "G"}</div>
                      <div className="composer-content">
                        <label className="guest-name-label" htmlFor="guest-name">POSTING AS</label>
                        <input
                          id="guest-name"
                          className="guest-name-input"
                          value={guestIdentity?.username ?? ""}
                          onChange={(event) => changeUsername(event.target.value)}
                          placeholder="Choose a display name"
                          aria-label="Your display name"
                          maxLength={24}
                          required
                        />
                        <textarea
                          value={threadDraft}
                          onChange={(event) => setThreadDraft(event.target.value)}
                          placeholder={`Start a discussion about ${selectedCharacter.name}...`}
                          aria-label={`Start a discussion about ${selectedCharacter.name}`}
                          maxLength={1000}
                          rows={2}
                        />
                        <div className="composer-footer">
                          <span>Guest names are not verified until sign-in is added.</span>
                          <button type="submit" className="post-button" disabled={!threadDraft.trim() || !guestIdentity?.username.trim() || submittingComment}>
                            {submittingComment ? "Posting..." : "Post"} <span>↗</span>
                          </button>
                        </div>
                      </div>
                    </form>

                    {storageWarning && <p className="comment-notice" role="status">{storageWarning}</p>}
                    <div className="discussion-heading"><span>THE DISCUSSION</span><span>{comments.length} {comments.length === 1 ? "COMMENT" : "COMMENTS"}</span></div>
                    <div className="thread-feed">
                      {commentsLoading ? (
                        <div className="feed-empty"><p>Loading comments...</p></div>
                      ) : comments.length === 0 ? (
                        <div className="feed-empty">
                          <div>{commentError ? "!" : "✎"}</div>
                          <p>{commentError ? "Comments could not be loaded." : "No comments yet. Start the conversation."}</p>
                        </div>
                      ) : roots.length === 0 ? (
                        <div className="feed-empty"><p>Load earlier comments to see the conversations these replies belong to.</p></div>
                      ) : roots.map((comment) => (
                        <CommentItem
                          key={comment.id}
                          comment={comment}
                          childrenByParent={childrenByParent}
                          username={guestIdentity?.username ?? "Guest"}
                          votingCommentIds={votingCommentIds}
                          onCreateReply={createComment}
                          onVote={voteOnComment}
                        />
                      ))}
                    </div>
                    {commentError && <p className="comment-error" role="alert">{commentError}</p>}
                    {hasMoreComments && (
                      <button className="load-comments-button" onClick={loadMoreComments} disabled={loadingMoreComments}>
                        {loadingMoreComments ? "Loading..." : "Load earlier comments"}
                      </button>
                    )}
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
