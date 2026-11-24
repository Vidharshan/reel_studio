"use client";

import { useState, useRef, type KeyboardEvent } from "react";

type WorkspaceTab = "studio" | "creators";

interface ScriptBeat {
  id: string;
  index: string;
  label: string;
  range: string;
  line: string;
  widthPct: number;
  startPct: number;
}

const SCRIPT_BEATS: ScriptBeat[] = [
  {
    id: "hook",
    index: "01",
    label: "HOOK",
    range: "0:00–0:06",
    line: "We shipped v1 last Tuesday. Three things broke in the first hour.",
    widthPct: 22,
    startPct: 0,
  },
  {
    id: "proof",
    index: "02",
    label: "BREAKDOWN",
    range: "0:06–0:21",
    line: "Billing webhook retried 400 times, onboarding dropped mobile signups, and our worker queue stalled.",
    widthPct: 53,
    startPct: 23,
  },
  {
    id: "close",
    index: "03",
    label: "CLOSE",
    range: "0:21–0:28",
    line: "Here is the 10-line fix we pushed before noon—full postmortem linked in bio.",
    widthPct: 23,
    startPct: 77,
  },
];

interface NicheCreator {
  id: string;
  initials: string;
  name: string;
  handle: string;
  focus: string;
  avgViews: string;
  fitTags: string[];
}

const CREATORS: NicheCreator[] = [
  {
    id: "maya",
    initials: "MC",
    name: "Maya Chen",
    handle: "@mayaships",
    focus: "Infra & DevTools",
    avgViews: "42K avg",
    fitTags: ["Staff Engineers", "B2B SaaS"],
  },
  {
    id: "devon",
    initials: "DB",
    name: "Devon Brooks",
    handle: "@devonbuilds",
    focus: "CLI & API Workflows",
    avgViews: "28K avg",
    fitTags: ["Backend Devs", "Indie Founders"],
  },
  {
    id: "tessa",
    initials: "TL",
    name: "Tessa Lind",
    handle: "@tessacodes",
    focus: "Product Engineering",
    avgViews: "61K avg",
    fitTags: ["Seed Founders", "Design Eng"],
  },
];

export function WorkspacePreview() {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("studio");
  const [activeBeatIndex, setActiveBeatIndex] = useState<number>(0);
  const [requestedIds, setRequestedIds] = useState<Record<string, boolean>>({});

  const studioTabRef = useRef<HTMLButtonElement>(null);
  const creatorsTabRef = useRef<HTMLButtonElement>(null);

  const handleTabKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const next: WorkspaceTab = activeTab === "studio" ? "creators" : "studio";
      setActiveTab(next);
      if (next === "studio") {
        studioTabRef.current?.focus();
      } else {
        creatorsTabRef.current?.focus();
      }
    }
  };

  const toggleCollabRequest = (creatorId: string) => {
    setRequestedIds((prev) => ({
      ...prev,
      [creatorId]: !prev[creatorId],
    }));
  };

  const activeBeat = SCRIPT_BEATS[activeBeatIndex];

  return (
    <section
      className="rs-preview-wrap"
      aria-label="Interactive workspace preview"
    >
      <div className="rs-window">
        {/* Top bar */}
        <div className="rs-window-bar">
          <div className="rs-window-meta">
            <span className="rs-status-dot" aria-hidden="true" />
            <span className="rs-mono-label">REEL STUDIO · WORKSPACE</span>
          </div>

          <div
            className="rs-tablist"
            role="tablist"
            aria-label="Workspace mode"
          >
            <button
              ref={studioTabRef}
              id="tab-studio"
              type="button"
              role="tab"
              aria-selected={activeTab === "studio"}
              aria-controls="panel-studio"
              tabIndex={activeTab === "studio" ? 0 : -1}
              className={`rs-tab ${activeTab === "studio" ? "is-active" : ""}`}
              onClick={() => setActiveTab("studio")}
              onKeyDown={handleTabKeyDown}
            >
              Studio Mode
            </button>
            <button
              ref={creatorsTabRef}
              id="tab-creators"
              type="button"
              role="tab"
              aria-selected={activeTab === "creators"}
              aria-controls="panel-creators"
              tabIndex={activeTab === "creators" ? 0 : -1}
              className={`rs-tab ${activeTab === "creators" ? "is-active" : ""}`}
              onClick={() => setActiveTab("creators")}
              onKeyDown={handleTabKeyDown}
            >
              Creator Match
            </button>
          </div>
        </div>

        {/* Studio Mode Panel */}
        <div
          id="panel-studio"
          role="tabpanel"
          aria-labelledby="tab-studio"
          hidden={activeTab !== "studio"}
          className="rs-panel"
        >
          {/* Demographic filter + Best window row */}
          <div className="rs-panel-strip">
            <div className="rs-filter-group">
              <span className="rs-field-key">AUDIENCE</span>
              <span className="rs-filter-pill">
                Founders · B2B SaaS · 25–34
              </span>
            </div>
            <div className="rs-window-tag">
              <span className="rs-window-tag-dot" aria-hidden="true" />
              <span>Best window: Thu 7:30 PM</span>
            </div>
          </div>

          {/* Curated Trend Format */}
          <div className="rs-format-header">
            <div className="rs-format-meta">
              <span className="rs-field-key">CURATED TREND FORMAT</span>
              <span className="rs-format-signal">Early wave · Low saturation</span>
            </div>
            <h2 className="rs-format-title">
              &ldquo;3 things I broke before v1&rdquo;
            </h2>
          </div>

          {/* 3-Beat Script Preview */}
          <div className="rs-script-list" role="list" aria-label="Script beats">
            {SCRIPT_BEATS.map((beat, idx) => {
              const isSelected = idx === activeBeatIndex;
              return (
                <div key={beat.id} role="listitem">
                  <button
                    type="button"
                    className={`rs-beat-row ${isSelected ? "is-selected" : ""}`}
                    onClick={() => setActiveBeatIndex(idx)}
                    aria-pressed={isSelected}
                  >
                    <div className="rs-beat-left">
                      <span className="rs-beat-index">{beat.index}</span>
                      <span className="rs-beat-label">{beat.label}</span>
                      <span className="rs-beat-time">{beat.range}</span>
                    </div>
                    <p className="rs-beat-copy">{beat.line}</p>
                  </button>
                </div>
              );
            })}
          </div>

          {/* Timeline Bar */}
          <div className="rs-timeline-box">
            <div className="rs-timeline-head">
              <div className="rs-timeline-status">
                <span className="rs-timeline-check" aria-hidden="true">
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <polyline points="3.5 8.5 6.5 11.5 12.5 4.5" />
                  </svg>
                </span>
                <span>Auto-cut &amp; captioned · 0:28</span>
              </div>
              <span className="rs-timeline-readout">
                BEAT {activeBeat.index} · {activeBeat.range}
              </span>
            </div>

            <div className="rs-timeline-tracks" aria-hidden="true">
              <div className="rs-track-row">
                <span className="rs-track-name">V1</span>
                <div className="rs-track-lane">
                  {SCRIPT_BEATS.map((beat, idx) => (
                    <span
                      key={beat.id}
                      className={`rs-clip-block ${
                        idx === activeBeatIndex ? "is-active" : ""
                      }`}
                      style={{
                        left: `${beat.startPct}%`,
                        width: `${beat.widthPct}%`,
                      }}
                    >
                      <span className="rs-clip-label">{beat.index}</span>
                    </span>
                  ))}
                  <span
                    className="rs-playhead"
                    style={{ left: `${activeBeat.startPct + 2}%` }}
                  />
                </div>
              </div>
              <div className="rs-track-row">
                <span className="rs-track-name">CC</span>
                <div className="rs-track-lane rs-track-lane-captions">
                  <span className="rs-caption-seg" style={{ left: "1%", width: "18%" }} />
                  <span className="rs-caption-seg" style={{ left: "24%", width: "24%" }} />
                  <span className="rs-caption-seg" style={{ left: "50%", width: "23%" }} />
                  <span className="rs-caption-seg" style={{ left: "78%", width: "20%" }} />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Creator Match Panel */}
        <div
          id="panel-creators"
          role="tabpanel"
          aria-labelledby="tab-creators"
          hidden={activeTab !== "creators"}
          className="rs-panel"
        >
          <div className="rs-panel-strip">
            <div className="rs-filter-group">
              <span className="rs-field-key">PRODUCT DOMAIN</span>
              <span className="rs-filter-pill">Developer Tools</span>
            </div>
            <span className="rs-mono-muted">3 vetted matches · Brief in 1 click</span>
          </div>

          <div className="rs-creator-list" role="list">
            {CREATORS.map((creator) => {
              const isRequested = Boolean(requestedIds[creator.id]);
              return (
                <div
                  key={creator.id}
                  role="listitem"
                  className="rs-creator-row"
                >
                  <div className="rs-creator-identity">
                    <div className="rs-creator-avatar" aria-hidden="true">
                      {creator.initials}
                    </div>
                    <div className="rs-creator-info">
                      <div className="rs-creator-name-line">
                        <span className="rs-creator-name">{creator.name}</span>
                        <span className="rs-creator-handle">{creator.handle}</span>
                      </div>
                      <div className="rs-creator-sub">
                        <span>{creator.focus}</span>
                        <span aria-hidden="true">·</span>
                        <span>{creator.avgViews}</span>
                      </div>
                    </div>
                  </div>

                  <div className="rs-creator-tags">
                    {creator.fitTags.map((tag) => (
                      <span key={tag} className="rs-fit-tag">
                        {tag}
                      </span>
                    ))}
                  </div>

                  <div className="rs-creator-action">
                    <button
                      type="button"
                      className={`rs-collab-pill ${
                        isRequested ? "is-requested" : ""
                      }`}
                      onClick={() => toggleCollabRequest(creator.id)}
                      aria-pressed={isRequested}
                    >
                      <span className="rs-collab-dot" aria-hidden="true" />
                      {isRequested ? "Requested" : "Request Collab"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="rs-creator-footer">
            <span className="rs-mono-muted">
              Audience overlap verified before outreach · No agency markup
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
