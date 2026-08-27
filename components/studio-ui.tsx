"use client";

import React, { useState, useRef } from "react";
import type { StepEvent, Template } from "@/lib/pipeline";
import type { IconProps } from "@/components/icons";
import {
  IconAlert,
  IconCheck,
  IconChevron,
  IconClock,
  IconDollar,
  IconDownload,
  IconImage,
  IconLink,
  IconLayers,
  IconPlus,
  IconScissors,
  IconSparkles,
  IconX,
} from "@/components/icons";

export type StepStatus = StepEvent["status"];
type StepDef = { step: number; name: string; modelId: string; description?: string };
type StepMap = Record<number, StepEvent & { elapsedMs?: number }>;
type IconComp = (p: IconProps) => React.JSX.Element;

/* ==============================
   Brand Bar
   ============================== */
export function BrandBar() {
  return (
    <header className="brand-bar">
      <div className="brand-bar-inner">
        <div className="brand">
          <span className="brand-mark">
            <IconSparkles size={17} />
          </span>
          <span className="brand-text">
            <span className="brand-name">Reel Studio</span>
            <span className="brand-tagline">On-brand reels, every time</span>
          </span>
        </div>
        <span className="brand-pill">
          <span className="dot" />
          AI pipeline ready
        </span>
      </div>
    </header>
  );
}

/* ==============================
   Mode Toggle (segmented control)
   ============================== */
export function ModeToggle({
  mode,
  onChange,
  disabled,
}: {
  mode: "single" | "multiclip";
  onChange: (m: "single" | "multiclip") => void;
  disabled?: boolean;
}) {
  return (
    <div className="mode-toggle" role="tablist" aria-label="Input mode">
      <button
        type="button"
        role="tab"
        aria-selected={mode === "single"}
        className={`seg ${mode === "single" ? "active" : ""}`}
        disabled={disabled}
        onClick={() => onChange("single")}
      >
        <IconImage size={15} />
        Single Photo
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={mode === "multiclip"}
        className={`seg ${mode === "multiclip" ? "active" : ""}`}
        disabled={disabled}
        onClick={() => onChange("multiclip")}
      >
        <IconLayers size={15} />
        Multi-Clip
      </button>
    </div>
  );
}

/* ==============================
   Template Catalog
   ============================== */
export function TemplateCatalog({
  templates,
  selected,
  onSelect,
  disabled,
}: {
  templates: Template[];
  selected: string;
  onSelect: (tone: Template["tone"]) => void;
  disabled?: boolean;
}) {
  return (
    <section className="rail-section">
      <div className="rail-head">
        <span className="rail-label">Brand template</span>
        <span className="rail-note">Sets look &amp; feel</span>
      </div>
      <div className="template-grid">
        {templates.map((t) => {
          const active = selected === t.tone;
          return (
            <button
              key={t.id}
              type="button"
              className={`template-card ${active ? "selected" : ""}`}
              disabled={disabled}
              onClick={() => onSelect(t.tone)}
              aria-pressed={active}
            >
              <span className="template-thumb" style={{ background: t.vibe }} />
              <span className="template-info">
                <span className="template-name">{t.name}</span>
                <span className="template-tagline">{t.tagline}</span>
              </span>
              {active && (
                <span className="template-check">
                  <IconCheck size={12} />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}

/* ==============================
   Upload Zone (self-contained)
   ============================== */
export function UploadZone({
  label,
  hint,
  accept,
  multiple,
  preview,
  isUploading,
  disabled,
  onSelect,
  onRemove,
}: {
  label: string;
  hint: string;
  accept: string;
  multiple?: boolean;
  preview?: string | null;
  isUploading?: boolean;
  disabled?: boolean;
  onSelect: (files: FileList | null) => void;
  onRemove?: () => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <section className="rail-section">
      <div className="rail-head">
        <span className="rail-label">{label}</span>
      </div>
      <div
        className={`upload-zone ${dragOver ? "drag-over" : ""} ${preview ? "has-preview" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (!disabled) onSelect(e.dataTransfer.files);
        }}
        onClick={() => {
          if (!disabled && !preview) inputRef.current?.click();
        }}
      >
        {preview ? (
          <>
            <img src={preview} alt="Upload preview" className="upload-preview" />
            {onRemove && (
              <button
                type="button"
                className="icon-btn upload-remove"
                aria-label="Remove"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove();
                }}
              >
                <IconX size={14} />
              </button>
            )}
          </>
        ) : isUploading ? (
          <>
            <span className="spinner" style={{ width: 22, height: 22 }} />
            <p className="upload-text">Uploading&hellip;</p>
          </>
        ) : (
          <>
            <span className="upload-icon">
              {multiple ? <IconScissors size={26} /> : <IconImage size={26} />}
            </span>
            <p className="upload-text">
              <strong>{multiple ? "Drop your clips" : "Drop a photo"}</strong>
              &nbsp;or click to browse
            </p>
            <p className="upload-hint">{hint}</p>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          multiple={multiple}
          accept={accept}
          style={{ display: "none" }}
          disabled={disabled}
          onChange={(e) => {
            if (e.target.files) onSelect(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
    </section>
  );
}

/* ==============================
   Clip Grid (multi-clip thumbnails)
   ============================== */
export function ClipGrid({
  previews,
  onRemove,
}: {
  previews: string[];
  onRemove: (index: number) => void;
}) {
  return (
    <div className="clip-grid">
      {previews.map((src, i) => (
        <div className="clip-card" key={i}>
          <video src={src} muted playsInline />
          <span className="clip-index">Clip {i + 1}</span>
          <button
            type="button"
            className="icon-btn clip-remove"
            aria-label={`Remove clip ${i + 1}`}
            onClick={() => onRemove(i)}
          >
            <IconX size={12} />
          </button>
        </div>
      ))}
      {previews.length < 5 && (
        <button type="button" className="clip-card clip-add">
          <IconPlus size={18} />
          <span>Add</span>
        </button>
      )}
    </div>
  );
}

/* ==============================
   Hook Input
   ============================== */
export function HookInput({
  value,
  onChange,
  maxLength = 500,
}: {
  value: string;
  onChange: (v: string) => void;
  maxLength?: number;
}) {
  return (
    <section className="rail-section">
      <div className="rail-head">
        <span className="rail-label">Hook / script</span>
        <span className="rail-note">
          {value.length}/{maxLength}
        </span>
      </div>
      <textarea
        className="hook-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={maxLength}
        rows={3}
        placeholder="e.g. This hidden gem changes everything about your morning routine&hellip;"
      />
      <p className="field-hint">AI writes the voiceover from this — keep it punchy.</p>
    </section>
  );
}

/* ==============================
   Resume Card
   ============================== */
export function ResumeCard({
  checked,
  onToggle,
  skips,
  cost,
  timeSec,
}: {
  checked: boolean;
  onToggle: (v: boolean) => void;
  skips: number;
  cost: number;
  timeSec: number;
}) {
  return (
    <section className="resume-card">
      <label className="resume-toggle">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onToggle(e.target.checked)}
        />
        <span className="switch" aria-hidden />
        <span className="resume-label">Resume completed stages</span>
      </label>
      {checked && skips > 0 && (
        <div className="resume-meta">
          <span>Skips {skips}</span>
          <span>Saves ~${cost.toFixed(4)}</span>
          <span>Saves ~{timeSec}s</span>
        </div>
      )}
    </section>
  );
}

/* ==============================
   Generate Button
   ============================== */
export function GenerateButton({
  label,
  loading,
  disabled,
  onClick,
}: {
  label: string;
  loading?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="generate-btn"
      disabled={disabled || loading}
      onClick={onClick}
    >
      {loading ? (
        <>
          <span className="spinner" style={{ width: 16, height: 16 }} />
          Generating&hellip;
        </>
      ) : (
        <>
          <IconSparkles size={17} />
          {label}
        </>
      )}
    </button>
  );
}

/* ==============================
   Error Banner
   ============================== */
export function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="error-banner" role="alert">
      <IconAlert size={15} />
      <span>{message}</span>
    </div>
  );
}

/* ==============================
   Pipeline Stepper
   ============================== */
export function PipelineStepper({
  steps,
  definitions,
  icons,
  totalCost,
  totalTime,
}: {
  steps: StepMap;
  definitions: readonly StepDef[];
  icons: IconComp[];
  totalCost: number;
  totalTime: number;
}) {
  return (
    <section className="stepper-section">
      <div className="stepper-head">
        <span className="stepper-title">Pipeline</span>
        <div className="metrics">
          <span className="metric">
            <IconClock size={14} />
            {(totalTime / 1000).toFixed(1)}s
          </span>
          <span className="metric cost">
            <IconDollar size={14} />
            ${totalCost.toFixed(4)}
          </span>
        </div>
      </div>
      <ol className="stepper">
        {definitions.map((def, idx) => {
          const s = steps[def.step];
          const status: StepStatus = s?.status || "idle";
          const Icon = icons[idx] ?? IconScissors;
          return (
            <li key={def.step} className={`stepper-node st-${status}`}>
              <span className="stepper-dot">
                {status === "completed" ? (
                  <IconCheck size={15} />
                ) : (
                  <Icon size={15} />
                )}
              </span>
              <span className="stepper-name">{def.name}</span>
              <span className="stepper-sub">{def.modelId.split("/").slice(-1)[0]}</span>
              <span className="stepper-meta">{stepperMeta(status, s)}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function stepperMeta(status: StepStatus, s?: StepEvent & { elapsedMs?: number }) {
  switch (status) {
    case "running":
      return `${((s?.elapsedMs || 0) / 1000).toFixed(1)}s`;
    case "completed":
      return `${((s?.durationMs || 0) / 1000).toFixed(1)}s · $${(s?.costUsd || 0).toFixed(4)}`;
    case "failed":
      return s?.error || "Failed";
    case "queued":
      return "queued";
    default:
      return "waiting";
  }
}

/* ==============================
   Preview Card
   ============================== */
export function PreviewCard({
  icon,
  title,
  status,
  statusLabel,
  className,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  status: "waiting" | "generating" | "done" | "error";
  statusLabel: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`preview-card ${className || ""}`}>
      <div className="preview-card-head">
        <span className="preview-card-title">
          <span className="preview-card-icon">{icon}</span>
          {title}
        </span>
        <span className={`status-pill ${status}`}>{statusLabel}</span>
      </div>
      <div className="preview-card-body">{children}</div>
    </div>
  );
}

/* ==============================
   Waveform (deterministic — no flicker)
   ============================== */
export function Waveform({
  color,
  animated,
}: {
  color: string;
  animated?: boolean;
}) {
  const bars = 28;
  return (
    <div className="waveform" aria-hidden>
      {Array.from({ length: bars }, (_, i) => {
        const h = 6 + Math.abs(Math.sin(i * 0.9)) * 10 + Math.abs(Math.cos(i * 0.5)) * 8;
        return (
          <span
            key={i}
            className={`wave-bar ${animated ? "anim" : ""}`}
            style={{
              height: h,
              background: color,
              animationDelay: animated ? `${i * 0.045}s` : undefined,
            }}
          />
        );
      })}
    </div>
  );
}

/* ==============================
   Final Result
   ============================== */
export function FinalResult({
  result,
  onCopy,
}: {
  result: {
    finalUrl?: string;
    partial?: boolean;
  };
  onCopy: () => void;
}) {
  return (
    <section className="final-card">
      <div className="final-head">
        <span className="final-badge">
          <IconCheck size={14} />
          Reel ready
        </span>
      </div>
      <div className="final-stage">
        {result.finalUrl ? (
          <video className="final-video" src={result.finalUrl} controls autoPlay loop />
        ) : (
          <p className="final-note">No final video to show.</p>
        )}
      </div>
      <p className="final-note">
        {result.partial
          ? "Composed with available assets (some steps failed)."
          : "All steps completed — on-brand and ready to post."}
      </p>
      <div className="final-actions">
        <a
          className="btn btn-primary"
          href={result.finalUrl}
          download="reel.mp4"
          target="_blank"
          rel="noopener noreferrer"
        >
          <IconDownload size={16} />
          Download
        </a>
        <button type="button" className="btn btn-ghost" onClick={onCopy}>
          <IconLink size={16} />
          Copy link
        </button>
      </div>
    </section>
  );
}

/* ==============================
   Execution Trace
   ============================== */
export function TracePanel({
  open,
  onToggle,
  steps,
  definitions,
  callCount,
}: {
  open: boolean;
  onToggle: () => void;
  steps: StepMap;
  definitions: readonly StepDef[];
  callCount: number;
}) {
  return (
    <section className="trace-section">
      <button type="button" className="trace-toggle" onClick={onToggle}>
        <IconChevron size={14} className={open ? "open" : ""} />
        <span>Execution trace</span>
        <span className="trace-count">{callCount} calls</span>
      </button>
      {open && (
        <div className="trace-table-wrap">
          <table className="trace-table">
            <thead>
              <tr>
                <th>Step</th>
                <th>Model</th>
                <th>Status</th>
                <th>Duration</th>
                <th>Cost</th>
                <th>Input</th>
              </tr>
            </thead>
            <tbody>
              {definitions.map((def) => {
                const s = steps[def.step];
                if (!s) return null;
                return (
                  <tr key={def.step}>
                    <td className="trace-step">{def.name}</td>
                    <td>
                      <code className="trace-code">{s.modelId}</code>
                    </td>
                    <td>
                      <span className={`trace-status ${s.status}`}>{s.status}</span>
                    </td>
                    <td>
                      {s.durationMs
                        ? `${(s.durationMs / 1000).toFixed(1)}s`
                        : s.status === "running"
                        ? `${((s.elapsedMs || 0) / 1000).toFixed(1)}s`
                        : "—"}
                    </td>
                    <td>{s.costUsd ? `$${s.costUsd.toFixed(4)}` : "—"}</td>
                    <td className="trace-input">{s.inputSummary || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
