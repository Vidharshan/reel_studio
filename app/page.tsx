"use client";

import { useState, useRef, type FormEvent } from "react";
import { WorkspacePreview } from "@/components/workspace-preview";
import "./landing.css";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type RoleOption = "founder" | "creator" | null;
type FormStatus = "idle" | "submitting" | "success" | "invalid" | "error";

export default function LandingPage() {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<RoleOption>(null);
  const [status, setStatus] = useState<FormStatus>("idle");
  const [alreadyJoined, setAlreadyJoined] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const emailInputRef = useRef<HTMLInputElement>(null);

  const focusWaitlist = () => {
    setTimeout(() => {
      emailInputRef.current?.focus();
    }, 150);
  };

  const toggleRole = (next: "founder" | "creator") => {
    setRole((prev) => (prev === next ? null : next));
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = email.trim();

    if (!EMAIL_PATTERN.test(trimmed)) {
      setStatus("invalid");
      setErrorMessage("Enter a valid email address.");
      return;
    }

    setStatus("submitting");
    setErrorMessage("");

    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: trimmed,
          ...(role ? { role } : {}),
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setAlreadyJoined(Boolean(data.alreadyJoined));
        setStatus("success");
        setEmail("");
      } else {
        setStatus("error");
        setErrorMessage(
          data.error || "Unable to join the waitlist. Please try again."
        );
      }
    } catch {
      setStatus("error");
      setErrorMessage("Network error. Please try again.");
    }
  };

  const handleReset = () => {
    setStatus("idle");
    setAlreadyJoined(false);
    setErrorMessage("");
    setTimeout(() => {
      emailInputRef.current?.focus();
    }, 20);
  };

  return (
    <div className="rs-landing">
      {/* Top Navigation */}
      <header className="rs-nav">
        <div className="rs-nav-inner">
          <a href="#" className="rs-wordmark">
            <span className="rs-wordmark-dot" aria-hidden="true" />
            <span>Reel Studio</span>
          </a>
          <a
            href="#waitlist"
            className="rs-nav-cta"
            onClick={focusWaitlist}
          >
            Join Waitlist
          </a>
        </div>
      </header>

      <main className="rs-main">
        {/* Hero Section */}
        <section className="rs-hero">
          <p className="rs-eyebrow">FOR FOUNDERS &amp; CREATORS</p>

          <h1 className="rs-headline">
            Stop staring at a blank camera roll.
          </h1>

          <p className="rs-subheadline">
            Pick a trend that fits your audience, get a tight script, and cut a
            post-ready reel—or match with niche creators to talk about your
            product for you.
          </p>

          {/* Waitlist Form */}
          <div id="waitlist" className="rs-waitlist-block">
            <div className="rs-role-row">
              <span className="rs-role-hint">I&apos;m joining as</span>
              <div
                className="rs-role-group"
                role="group"
                aria-label="Optional role"
              >
                <button
                  type="button"
                  className={`rs-role-btn ${role === "founder" ? "is-active" : ""}`}
                  onClick={() => toggleRole("founder")}
                  aria-pressed={role === "founder"}
                >
                  Founder
                </button>
                <button
                  type="button"
                  className={`rs-role-btn ${role === "creator" ? "is-active" : ""}`}
                  onClick={() => toggleRole("creator")}
                  aria-pressed={role === "creator"}
                >
                  Creator
                </button>
              </div>
            </div>

            {status === "success" ? (
              <div className="rs-confirmation" role="status" aria-live="polite">
                <div className="rs-confirmation-body">
                  <span className="rs-confirmation-icon" aria-hidden="true">
                    <svg
                      width="11"
                      height="11"
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                    >
                      <polyline points="3 8.5 6.5 12 13 4.5" />
                    </svg>
                  </span>
                  <div>
                    <p className="rs-confirmation-title">
                      {alreadyJoined
                        ? "You’re already on the waitlist."
                        : "Request received."}
                    </p>
                    <p className="rs-confirmation-sub">
                      {alreadyJoined
                        ? "Your spot is still saved. We’ll email you when your invite opens."
                        : "We’ll send your invite link as soon as the next weekly batch opens."}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  className="rs-confirmation-reset"
                  onClick={handleReset}
                >
                  Add another
                </button>
              </div>
            ) : (
              <form
                onSubmit={handleSubmit}
                className="rs-form"
                noValidate
              >
                <input
                  ref={emailInputRef}
                  type="email"
                  name="email"
                  autoComplete="email"
                  placeholder="you@domain.com"
                  aria-label="Email address"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (status === "invalid" || status === "error") {
                      setStatus("idle");
                      setErrorMessage("");
                    }
                  }}
                  className="rs-input"
                  required
                />
                <button
                  type="submit"
                  className="rs-submit"
                  disabled={status === "submitting"}
                >
                  {status === "submitting" ? "Requesting..." : "Request Access"}
                </button>
              </form>
            )}

            {(status === "invalid" || status === "error") && errorMessage && (
              <p className="rs-error" role="alert">
                {errorMessage}
              </p>
            )}

            <p className="rs-microcopy">Private beta · Rolling out weekly</p>
          </div>

          {/* Interactive Workspace Preview */}
          <WorkspacePreview />
        </section>

        {/* Core Workflow Section (01 - 04) */}
        <section className="rs-workflow" aria-label="Core workflow">
          <p className="rs-section-kicker">WORKFLOW</p>

          <div className="rs-workflow-list">
            <article className="rs-workflow-row">
              <span className="rs-step-num">01</span>
              <h2 className="rs-step-title">Demographic Trend Curation</h2>
              <p className="rs-step-desc">
                Filter out generic viral noise. Surface formats already working
                with your specific audience before they get overused.
              </p>
            </article>

            <article className="rs-workflow-row">
              <span className="rs-step-num">02</span>
              <h2 className="rs-step-title">Scripts That Sound Like You</h2>
              <p className="rs-step-desc">
                Turn any selected format into a beat-by-beat script—complete
                with a sensible posting window—without sounding like a template.
              </p>
            </article>

            <article className="rs-workflow-row">
              <span className="rs-step-num">03</span>
              <h2 className="rs-step-title">Auto-Edited, Post-Ready Cuts</h2>
              <p className="rs-step-desc">
                Drop in raw takes. Get tight pacing, clean captions, and a
                finished vertical cut ready to publish.
              </p>
            </article>
          </div>

          {/* 04 Dedicated Callout Strip */}
          <aside className="rs-marketplace-strip">
            <div>
              <p className="rs-marketplace-eyebrow">
                04 · NICHE CREATOR MARKETPLACE
              </p>
              <h2 className="rs-marketplace-title">
                Don&apos;t want to be on camera?
              </h2>
              <p className="rs-marketplace-desc">
                Match your product domain with vetted niche creators who already
                have your buyers&apos; attention, and brief them in one click.
              </p>
            </div>
            <a
              href="#waitlist"
              className="rs-marketplace-cta"
              onClick={focusWaitlist}
            >
              Join Waitlist
            </a>
          </aside>
        </section>
      </main>

      {/* Minimal Footer */}
      <footer className="rs-footer">
        <div className="rs-footer-inner">
          <p className="rs-footer-copy">&copy; 2026 Reel Studio</p>
          <nav className="rs-footer-links" aria-label="Footer links">
            <a href="mailto:hello@reelstudio.co">Contact</a>
            <a
              href="https://x.com"
              target="_blank"
              rel="noopener noreferrer"
            >
              X
            </a>
            <a
              href="https://github.com"
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
