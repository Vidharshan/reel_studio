"use client";

import { useState, useEffect } from "react";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
type FormStatus = "idle" | "submitting" | "success" | "invalid" | "error";

export default function WaitlistPage() {
  const [email, setEmail] = useState("");
  const [emailSecondary, setEmailSecondary] = useState("");
  const [status, setStatus] = useState<FormStatus>("idle");
  const [statusSecondary, setStatusSecondary] = useState<FormStatus>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [errorMessageSecondary, setErrorMessageSecondary] = useState("");
  const [waitlistCount, setWaitlistCount] = useState(148);

  // Mockup Simulation States
  const [currentWordIdx, setCurrentWordIdx] = useState(0);
  const [consoleLineIdx, setConsoleLineIdx] = useState(0);

  const mockupWords = [
    { text: "CREATE", sub: "0.2s · A-roll" },
    { text: "REELS", sub: "0.6s · Hook" },
    { text: "THAT", sub: "0.9s · Scale 1.15x" },
    { text: "ACTUALLY", sub: "1.4s · Bold + Color" },
    { text: "PERFORM", sub: "1.9s · CTA" }
  ];

  const consoleLines = [
    { type: "info", text: "Probing input video duration..." },
    { type: "info", text: "Starting local Whisper transcription (base)..." },
    { type: "success", text: "Bypassed CUDA; transcription completed on CPU." },
    { type: "info", text: "DeepSeek-R1 editorial planning initiated..." },
    { type: "success", text: "Creative plan: 3 zoom cuts, 1 B-roll suggestion, 5 highlights." },
    { type: "info", text: "Compiling video headlessly with FFmpeg..." },
    { type: "success", text: "Final vertical reel generated: 1080x1920 @ 60fps." }
  ];

  useEffect(() => {
    // Cycle mockup text
    const textInterval = setInterval(() => {
      setCurrentWordIdx((prev) => (prev + 1) % mockupWords.length);
    }, 1200);

    // Cycle console simulator
    const consoleInterval = setInterval(() => {
      setConsoleLineIdx((prev) => (prev + 1) % (consoleLines.length + 1));
    }, 2000);

    return () => {
      clearInterval(textInterval);
      clearInterval(consoleInterval);
    };
  }, [consoleLines.length, mockupWords.length]);

  const handleWaitlistSubmit = async (e: React.FormEvent, isSecondary = false) => {
    e.preventDefault();
    const targetEmail = (isSecondary ? emailSecondary : email).trim();
    const setTargetStatus = isSecondary ? setStatusSecondary : setStatus;
    const setTargetErrorMessage = isSecondary ? setErrorMessageSecondary : setErrorMessage;

    if (!EMAIL_PATTERN.test(targetEmail)) {
      setTargetStatus("invalid");
      setTargetErrorMessage("Please enter a valid email address.");
      return;
    }

    setTargetStatus("submitting");
    setTargetErrorMessage("");

    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: targetEmail })
      });

      const data = await res.json();
      if (res.ok) {
        setTargetStatus("success");
        if (data.count) {
          setWaitlistCount(data.count + 148); // add our baseline waitlist count
        }
        if (isSecondary) setEmailSecondary("");
        else setEmail("");
      } else {
        setTargetStatus("error");
        setTargetErrorMessage(data.error || "We couldn't add you to the waitlist. Please try again.");
      }
    } catch {
      setTargetStatus("error");
      setTargetErrorMessage("We couldn't reach the waitlist service. Please try again.");
    }
  };

  return (
    <div className="waitlist-wrapper">
      {/* Navigation */}
      <nav className="waitlist-nav">
        <div className="waitlist-logo">
          <div className="waitlist-logo-mark">RT</div>
          <span>Reeltrix</span>
        </div>
        <div className="waitlist-badge">
          <div className="waitlist-badge-dot"></div>
          <span>Engine v1.0 Live</span>
        </div>
      </nav>

      {/* Main Content */}
      <main className="waitlist-main">
        {/* Section 1: Hero */}
        <section className="waitlist-hero">
          <div className="waitlist-hero-content">
            <h1 className="waitlist-headline">
              Create reels that <br />
              actually perform
            </h1>
            <p className="waitlist-subheadline">
              AI-powered reel studio with templates built from what’s working right now. From raw footage to a ready-to-post short in 60 seconds.
            </p>

            <div className="waitlist-form-block">
              {status === "success" ? (
                <div style={{
                  padding: "16px",
                  backgroundColor: "#00E6761A",
                  border: "1px solid rgba(0, 230, 118, 0.3)",
                  borderRadius: "8px",
                  color: "#00E676",
                  fontSize: "0.95rem",
                  fontWeight: 500
                }}>
                  ✓ You&apos;ve been added to the priority waitlist!
                </div>
              ) : (
                <form onSubmit={(e) => handleWaitlistSubmit(e, false)} className="waitlist-form">
                  <div className="waitlist-input-wrapper">
                    <input
                      type="email"
                      placeholder="Enter your email address"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="waitlist-input"
                      required
                    />
                  </div>
                  <button type="submit" className="waitlist-btn" disabled={status === "submitting"}>
                    {status === "submitting" ? "Joining..." : "Join Waitlist"}
                  </button>
                </form>
              )}
              {(status === "invalid" || status === "error") && (
                <p style={{ color: "#F87171", fontSize: "0.82rem", marginTop: "-4px" }}>
                  {errorMessage}
                </p>
              )}
              <div className="waitlist-trust-line">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
                <span>Join {waitlistCount} creators already on the waitlist. No spam. Only launch updates.</span>
              </div>
            </div>
          </div>

          <div className="waitlist-hero-visual">
            {/* Live Interactive CSS Dashboard Mockup */}
            <div className="waitlist-mockup-card">
              <div className="waitlist-mockup-header">
                <div className="waitlist-mockup-dots">
                  <div className="waitlist-mockup-dot active"></div>
                  <div className="waitlist-mockup-dot"></div>
                  <div className="waitlist-mockup-dot"></div>
                </div>
                <div className="waitlist-mockup-title">REELTRIX ENGINE PREVIEW</div>
              </div>
              <div className="waitlist-mockup-body">
                {/* Visual Video Preview Screen */}
                <div className="waitlist-mockup-screen">
                  <div className="waitlist-mockup-video-indicator">
                    <span>•</span> LIVE PREVIEW
                  </div>
                  <div className="waitlist-mockup-captions-preview">
                    <div className="waitlist-mockup-word-highlight">
                      {mockupWords[currentWordIdx].text}
                    </div>
                    <div className="waitlist-mockup-word-sub">
                      {mockupWords[currentWordIdx].sub}
                    </div>
                  </div>
                </div>

                {/* Simulated Timeline tracks */}
                <div className="waitlist-mockup-timeline">
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "2px" }}>
                    <span className="waitlist-mockup-label">Audio & Cuts Track</span>
                    <span className="waitlist-mockup-label">2.4s active</span>
                  </div>
                  <div className="waitlist-mockup-track">
                    <div className="waitlist-mockup-block" style={{ width: "30%", left: "0%" }}></div>
                    <div className="waitlist-mockup-block" style={{ width: "25%", left: "38%" }}></div>
                    <div className="waitlist-mockup-block" style={{ width: "20%", left: "70%" }}></div>
                    {/* Playhead */}
                    <div className="waitlist-mockup-playhead" style={{ left: `${(currentWordIdx / (mockupWords.length - 1)) * 90 + 5}%`, transition: "left 0.8s ease-in-out" }}>
                      <div className="waitlist-mockup-playhead-cap"></div>
                    </div>
                  </div>
                </div>

                {/* Simulated Engine Console */}
                <div className="waitlist-mockup-console">
                  {consoleLines.slice(0, consoleLineIdx).map((line, i) => (
                    <div key={i} className="waitlist-mockup-console-line" style={{ marginBottom: "2px" }}>
                      <span className="waitlist-mockup-console-prompt">&gt;</span>
                      <span style={{ color: line.type === "success" ? "#00E676" : "#A1A1AA" }}>
                        {line.text}
                      </span>
                    </div>
                  ))}
                  {consoleLineIdx === 0 && (
                    <div className="waitlist-mockup-console-line">
                      <span className="waitlist-mockup-console-prompt">&gt;</span>
                      <span style={{ color: "#71717A" }}>Awaiting video import...</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Section 2: What it is */}
        <section className="waitlist-intro-section">
          <p className="waitlist-intro-text">
            Reeltrix helps you turn ideas into <span>high-performing</span> short-form videos using proven viral templates and real-time insights on what works.
          </p>
        </section>

        {/* Section 3: 3 Key Benefits */}
        <section className="waitlist-benefits-section">
          <h2 className="waitlist-section-title">Built for viral distribution</h2>
          <div className="waitlist-benefits-grid">
            {/* Benefit 1 */}
            <div className="waitlist-benefit-card">
              <div className="waitlist-benefit-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
              </div>
              <h3 className="waitlist-benefit-title">Viral Templates</h3>
              <p className="waitlist-benefit-desc">
                Templates built directly from hooks, structures, and pacing patterns that are currently performing well in the algorithm.
              </p>
            </div>

            {/* Benefit 2 */}
            <div className="waitlist-benefit-card">
              <div className="waitlist-benefit-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </svg>
              </div>
              <h3 className="waitlist-benefit-title">Instant Creation</h3>
              <p className="waitlist-benefit-desc">
                Go from a simple script outline or footage clips to a professionally paced, edited, and captioned reel in seconds.
              </p>
            </div>

            {/* Benefit 3 */}
            <div className="waitlist-benefit-card">
              <div className="waitlist-benefit-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="16" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
              </div>
              <h3 className="waitlist-benefit-title">Built-in Guidance</h3>
              <p className="waitlist-benefit-desc">
                Step-by-step guidance on high-retention hook structures, editing rhythm, sound effects, and kinetic layouts.
              </p>
            </div>
          </div>
        </section>

        {/* Section 4: Secondary Signup */}
        <section className="waitlist-cta-section">
          <h2 className="waitlist-cta-title">Secure early access today</h2>
          <p className="waitlist-cta-sub">
            Be the first to know when we open registration spots. Beta access will be granted in batches.
          </p>

          <div className="waitlist-form-block" style={{ margin: "0 auto" }}>
            {statusSecondary === "success" ? (
              <div style={{
                padding: "16px",
                backgroundColor: "#00E6761A",
                border: "1px solid rgba(0, 230, 118, 0.3)",
                borderRadius: "8px",
                color: "#00E676",
                fontSize: "0.95rem",
                fontWeight: 500
              }}>
                ✓ You&apos;ve been added to the priority waitlist!
              </div>
            ) : (
              <form onSubmit={(e) => handleWaitlistSubmit(e, true)} className="waitlist-form">
                <div className="waitlist-input-wrapper">
                  <input
                    type="email"
                    placeholder="Enter your email address"
                    value={emailSecondary}
                    onChange={(e) => setEmailSecondary(e.target.value)}
                    className="waitlist-input"
                    required
                  />
                </div>
                <button type="submit" className="waitlist-btn" disabled={statusSecondary === "submitting"}>
                  {statusSecondary === "submitting" ? "Joining..." : "Join Waitlist"}
                </button>
              </form>
            )}
            {(statusSecondary === "invalid" || statusSecondary === "error") && (
              <p style={{ color: "#F87171", fontSize: "0.82rem", marginTop: "-4px" }}>
                {errorMessageSecondary}
              </p>
            )}
            <div className="waitlist-trust-line" style={{ justifyContent: "center" }}>
              <span>No spam. Only launch updates.</span>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="waitlist-footer">
        <div className="waitlist-footer-logo">
          <div className="waitlist-logo-mark" style={{ width: "24px", height: "24px", borderRadius: "6px", fontSize: "0.8rem", boxShadow: "none" }}>RT</div>
          <span>Reeltrix</span>
        </div>
        <div>
          <span>&copy; 2026 Reeltrix. All rights reserved.</span>
        </div>
        <div className="waitlist-footer-links">
          <a href="#" className="waitlist-footer-link" onClick={(e) => e.preventDefault()}>Privacy Policy</a>
        </div>
      </footer>
    </div>
  );
}
