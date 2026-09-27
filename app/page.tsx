"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
type FormStatus = "idle" | "submitting" | "success" | "invalid" | "error";

export default function WaitlistPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<FormStatus>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [waitlistCount, setWaitlistCount] = useState(148);

  // Mockup Simulation States
  const [currentWordIdx, setCurrentWordIdx] = useState(0);
  const [consoleLineIdx, setConsoleLineIdx] = useState(0);

  const mockupWords = [
    { text: "RAW TAKES", sub: "0.0s · Silence cut" },
    { text: "FILLER REMOVED", sub: "0.4s · Jev Decision" },
    { text: "B-ROLL MATCHED", sub: "1.2s · Pexels PiP" },
    { text: "KINETIC CAPTIONS", sub: "1.8s · Burned ASS" },
    { text: "PUBLISH READY", sub: "2.4s · 9:16 Reel" }
  ];

  const consoleLines = [
    { type: "info", text: "Direct VPS upload via tusd (chunked, resumable)..." },
    { type: "success", text: "Speech transcribed via local faster-whisper on VPS." },
    { type: "info", text: "Jev typesafe model: filler scoring & footage classification..." },
    { type: "success", text: "Filler words & false starts automatically removed." },
    { type: "info", text: "Gemini 2.5 Flash: edit plan & caption timing..." },
    { type: "success", text: "Stitched & composited locally via FFmpeg." }
  ];

  // Fetch initial waitlist count
  useEffect(() => {
    fetch("/api/waitlist")
      .then((res) => res.json())
      .then((data) => {
        if (data.count) setWaitlistCount(data.count + 148);
      })
      .catch(() => { /* use default count */ });
  }, []);

  useEffect(() => {
    const textInterval = setInterval(() => {
      setCurrentWordIdx((prev) => (prev + 1) % mockupWords.length);
    }, 1400);

    const consoleInterval = setInterval(() => {
      setConsoleLineIdx((prev) => (prev + 1) % (consoleLines.length + 1));
    }, 2200);

    return () => {
      clearInterval(textInterval);
      clearInterval(consoleInterval);
    };
  }, [consoleLines.length, mockupWords.length]);

  const handleWaitlistSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetEmail = email.trim();

    if (!EMAIL_PATTERN.test(targetEmail)) {
      setStatus("invalid");
      setErrorMessage("Please enter a valid email address.");
      return;
    }

    setStatus("submitting");
    setErrorMessage("");

    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: targetEmail }),
      });

      const data = await res.json();
      if (res.ok) {
        setStatus("success");
        if (data.count) {
          setWaitlistCount(data.count + 148);
        }
        setEmail("");
      } else {
        setStatus("error");
        setErrorMessage(data.error || "We couldn't add you to the waitlist. Please try again.");
      }
    } catch {
      setStatus("error");
      setErrorMessage("Service temporarily unavailable. Please try again.");
    }
  };

  return (
    <div className="landing-shell">
      {/* Navigation */}
      <header className="landing-nav">
        <div className="landing-brand">
          <div className="landing-logo-mark">RT</div>
          <span className="landing-logo-text">Reeltrix</span>
          <span className="landing-version-pill">v1.0 Engine</span>
        </div>
        <div className="landing-nav-actions">
          <Link href="/v1" className="landing-nav-studio-btn">
            Open Studio ➔
          </Link>
        </div>
      </header>

      {/* Main Hero Container — Viewport-fitted */}
      <main className="landing-hero-container">
        <div className="landing-grid">
          {/* Left Column: Headline & Waitlist Form */}
          <div className="landing-hero-content">
            <div className="landing-kicker">
              <span className="kicker-dot"></span>
              Automated Short-Form Engine for Brands
            </div>

            <h1 className="landing-headline">
              Turn raw footage into <br />
              <span>high-retention reels</span>
            </h1>

            <p className="landing-subheadline">
              Upload raw, unedited takes — mistakes, filler words, and dead air included.
              Reeltrix cuts filler, inserts relevant B-roll, and burns modern captions automatically.
            </p>

            <div className="landing-form-box">
              {status === "success" ? (
                <div className="landing-success-alert">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <span>You&apos;ve been added to priority early access! We&apos;ll notify you when your spot opens.</span>
                </div>
              ) : (
                <form onSubmit={handleWaitlistSubmit} className="landing-form">
                  <input
                    type="email"
                    placeholder="name@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="landing-input"
                    required
                  />
                  <button type="submit" className="landing-submit-btn" disabled={status === "submitting"}>
                    {status === "submitting" ? "Joining..." : "Get Early Access"}
                  </button>
                </form>
              )}

              {(status === "invalid" || status === "error") && (
                <p className="landing-error-text">{errorMessage}</p>
              )}

              <div className="landing-trust-bar">
                <div className="landing-avatars">
                  <span className="avatar av-1">S</span>
                  <span className="avatar av-2">M</span>
                  <span className="avatar av-3">R</span>
                </div>
                <span className="trust-text">
                  Joined by <strong>{waitlistCount}</strong> social managers & content teams
                </span>
              </div>
            </div>

            {/* 3 Feature Pills */}
            <div className="landing-feature-pills">
              <div className="pill-item">
                <span className="pill-icon">✂️</span>
                <span>Filler & Silence Removal</span>
              </div>
              <div className="pill-item">
                <span className="pill-icon">🎬</span>
                <span>Auto B-Roll Placement</span>
              </div>
              <div className="pill-item">
                <span className="pill-icon">🎵</span>
                <span>Local FFmpeg Compose</span>
              </div>
            </div>
          </div>

          {/* Right Column: Studio Preview Widget */}
          <div className="landing-hero-visual">
            <div className="studio-preview-card">
              <div className="studio-preview-bar">
                <div className="preview-dots">
                  <span className="dot dot-r"></span>
                  <span className="dot dot-y"></span>
                  <span className="dot dot-g"></span>
                </div>
                <span className="preview-title">REELTRIX ENGINE · LIVE RUN</span>
                <span className="preview-badge">LOCAL FFMPEG</span>
              </div>

              <div className="studio-preview-body">
                {/* 9:16 Visual Screen */}
                <div className="preview-screen">
                  <div className="preview-rec-tag">
                    <span className="rec-dot"></span> 9:16 PREVIEW
                  </div>

                  <div className="preview-caption-box">
                    <div className="preview-word-highlight">
                      {mockupWords[currentWordIdx].text}
                    </div>
                    <div className="preview-word-sub">
                      {mockupWords[currentWordIdx].sub}
                    </div>
                  </div>
                </div>

                {/* Timeline Tracks */}
                <div className="preview-timeline">
                  <div className="timeline-meta">
                    <span>A-Roll & Cut Timeline</span>
                    <span>15.0s active</span>
                  </div>
                  <div className="timeline-track-bar">
                    <div className="track-segment" style={{ width: "28%", left: "0%" }}></div>
                    <div className="track-segment" style={{ width: "32%", left: "34%" }}></div>
                    <div className="track-segment" style={{ width: "22%", left: "72%" }}></div>
                    <div
                      className="timeline-playhead"
                      style={{
                        left: `${(currentWordIdx / (mockupWords.length - 1)) * 88 + 6}%`,
                        transition: "left 0.7s cubic-bezier(0.22, 1, 0.36, 1)"
                      }}
                    >
                      <div className="playhead-cap"></div>
                    </div>
                  </div>
                </div>

                {/* Engine Console Output */}
                <div className="preview-console">
                  {consoleLines.slice(0, consoleLineIdx).map((line, i) => (
                    <div key={i} className="console-row">
                      <span className="console-prompt">&gt;</span>
                      <span className={line.type === "success" ? "console-success" : "console-info"}>
                        {line.text}
                      </span>
                    </div>
                  ))}
                  {consoleLineIdx === 0 && (
                    <div className="console-row">
                      <span className="console-prompt">&gt;</span>
                      <span className="console-info">Awaiting raw footage upload...</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Sleek Minimal Footer */}
      <footer className="landing-footer">
        <span>&copy; 2026 Reeltrix Studio Engine. Built for content teams.</span>
        <div className="landing-footer-links">
          <Link href="/v1">Open Studio</Link>
          <a href="#" onClick={(e) => e.preventDefault()}>Privacy</a>
        </div>
      </footer>
    </div>
  );
}
