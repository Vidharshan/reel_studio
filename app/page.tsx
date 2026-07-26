"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  STEP_DEFINITIONS,
  MULTICLIP_STEP_DEFINITIONS,
  TONE_OPTIONS,
  type StepEvent,
  type ToneStyle,
  type PipelineMode,
} from "@/lib/pipeline";

/* ==============================
   Types
   ============================== */
interface StepState extends StepEvent {
  elapsedMs: number;
}

/* ==============================
   Main App Component
   ============================== */
export default function ReelStudio() {
  /* --- State --- */
  const [mode, setMode] = useState<PipelineMode>("single");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [videoFiles, setVideoFiles] = useState<File[]>([]);
  const [videoPreviews, setVideoPreviews] = useState<string[]>([]);
  const [videoUrls, setVideoUrls] = useState<string[]>([]);
  const [isUploadingVideo, setIsUploadingVideo] = useState(false);
  const [hookText, setHookText] = useState("");
  const [tone, setTone] = useState<ToneStyle>("cinematic");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [steps, setSteps] = useState<Record<number, StepState>>({});
  const [finalResult, setFinalResult] = useState<{
    videoUrl?: string;
    voiceoverUrl?: string;
    musicUrl?: string;
    finalUrl?: string;
    partial?: boolean;
  } | null>(null);
  const [pipelineError, setPipelineError] = useState<string | null>(null);
  const [traceOpen, setTraceOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /* --- Elapsed timer --- */
  useEffect(() => {
    if (isGenerating) {
      timerRef.current = setInterval(() => {
        setSteps((prev) => {
          const updated = { ...prev };
          for (const key of Object.keys(updated)) {
            const step = updated[Number(key)];
            if (step.status === "running" && step.startedAt) {
              updated[Number(key)] = {
                ...step,
                elapsedMs: Date.now() - step.startedAt,
              };
            }
          }
          return updated;
        });
      }, 100);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isGenerating]);

  /* --- File handling --- */
  const handleFileSelect = useCallback(async (file: File) => {
    const validTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!validTypes.includes(file.type)) {
      alert("Invalid file type. Please use JPEG, PNG, WebP, or GIF.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      alert("File too large. Maximum 10MB.");
      return;
    }

    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));

    // Upload to server
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (data.url) {
        setImageUrl(data.url);
      } else {
        alert("Upload failed: " + (data.error || "Unknown error"));
        setImageFile(null);
        setImagePreview(null);
      }
    } catch {
      alert("Upload failed. Please try again.");
      setImageFile(null);
      setImagePreview(null);
    } finally {
      setIsUploading(false);
    }
  }, []);

  const handleVideoSelect = useCallback(async (files: FileList) => {
    const newFiles = Array.from(files);

    if (videoFiles.length + newFiles.length > 5) {
      alert("You can upload a maximum of 5 clips.");
      return;
    }

    const validTypes = ["video/mp4", "video/quicktime", "video/webm", "video/x-m4v", "image/gif"];
    for (const file of newFiles) {
      if (!validTypes.includes(file.type)) {
        alert(`Invalid type for ${file.name}. Only MP4, MOV, WebM, or GIF are allowed.`);
        return;
      }
      if (file.size > 20 * 1024 * 1024) {
        alert(`${file.name} is too large. Max 20MB.`);
        return;
      }
    }

    setIsUploadingVideo(true);
    try {
      const uploadedUrls: string[] = [];
      const previews: string[] = [];

      for (const file of newFiles) {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch("/api/upload-video", { method: "POST", body: formData });
        const data = await res.json();
        if (data.url) {
          uploadedUrls.push(data.url);
          previews.push(URL.createObjectURL(file));
        } else {
          alert(`Failed to upload ${file.name}: ${data.error || "Unknown error"}`);
        }
      }

      setVideoFiles((prev) => [...prev, ...newFiles]);
      setVideoPreviews((prev) => [...prev, ...previews]);
      setVideoUrls((prev) => [...prev, ...uploadedUrls]);
    } catch {
      alert("Failed to upload videos. Please try again.");
    } finally {
      setIsUploadingVideo(false);
    }
  }, [videoFiles]);

  const handleRemoveVideo = (index: number) => {
    setVideoFiles((prev) => prev.filter((_, i) => i !== index));
    setVideoPreviews((prev) => prev.filter((_, i) => i !== index));
    setVideoUrls((prev) => prev.filter((_, i) => i !== index));
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (mode === "single") {
        const file = e.dataTransfer.files[0];
        if (file) handleFileSelect(file);
      } else {
        if (e.dataTransfer.files) handleVideoSelect(e.dataTransfer.files);
      }
    },
    [mode, handleFileSelect, handleVideoSelect]
  );

  const handleRemoveImage = () => {
    setImageFile(null);
    setImagePreview(null);
    setImageUrl(null);
  };

  /* --- Generate --- */
  const handleGenerate = async () => {
    if (mode === "single") {
      if (!imageUrl || !hookText.trim()) return;
    } else {
      if (videoUrls.length === 0 || !hookText.trim()) return;
    }

    setIsGenerating(true);
    setFinalResult(null);
    setPipelineError(null);
    setSteps({});
    setTraceOpen(false);

    // Initialize all steps as idle
    const initialSteps: Record<number, StepState> = {};
    const stepDefs = mode === "single" ? STEP_DEFINITIONS : MULTICLIP_STEP_DEFINITIONS;
    stepDefs.forEach((def) => {
      initialSteps[def.step] = {
        step: def.step,
        name: def.name,
        modelId: def.modelId,
        status: "queued",
        elapsedMs: 0,
      };
    });
    setSteps(initialSteps);

    try {
      const endpoint = mode === "single" ? "/api/generate" : "/api/generate-multiclip";
      const payload = mode === "single"
        ? { imageUrl, hookText: hookText.trim(), tone }
        : { videoUrls, hookText: hookText.trim(), tone };

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error("Failed to start pipeline");
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      if (!reader) throw new Error("No response stream");

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        let eventType = "";
        let eventData = "";

        for (const line of lines) {
          if (line.startsWith("event: ")) {
            eventType = line.slice(7);
          } else if (line.startsWith("data: ")) {
            eventData = line.slice(6);

            if (eventType && eventData) {
              try {
                const data = JSON.parse(eventData);
                handleSSEEvent(eventType, data);
              } catch {
                // skip malformed
              }
              eventType = "";
              eventData = "";
            }
          }
        }
      }
    } catch (err) {
      const error = err as Error;
      setPipelineError(error.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSSEEvent = (type: string, data: Record<string, unknown>) => {
    switch (type) {
      case "step": {
        const stepData = data as unknown as StepEvent;
        setSteps((prev) => ({
          ...prev,
          [stepData.step]: {
            ...prev[stepData.step],
            ...stepData,
            elapsedMs: stepData.durationMs || prev[stepData.step]?.elapsedMs || 0,
          },
        }));
        break;
      }
      case "complete": {
        setFinalResult(data as typeof finalResult);
        break;
      }
      case "cached": {
        setFinalResult(data as typeof finalResult);
        // Mark all steps as completed instantly
        setSteps((prev) => {
          const updated = { ...prev };
          for (const key of Object.keys(updated)) {
            updated[Number(key)] = {
              ...updated[Number(key)],
              status: "completed",
              durationMs: 0,
              costUsd: 0,
              elapsedMs: 0,
            };
          }
          return updated;
        });
        break;
      }
      case "pipeline_error": {
        setPipelineError(data.message as string);
        break;
      }
    }
  };

  /* --- Computed values --- */
  const totalCost = Object.values(steps).reduce(
    (sum, s) => sum + (s.costUsd || 0),
    0
  );
  const totalTime = Object.values(steps).reduce(
    (sum, s) => sum + (s.status === "running" ? s.elapsedMs : s.durationMs || 0),
    0
  );

  const canGenerate =
    mode === "single"
      ? !!imageUrl && !!hookText.trim() && !isGenerating && !isUploading
      : videoUrls.length > 0 && !!hookText.trim() && !isGenerating && !isUploadingVideo;

  /* ==============================
     Render
     ============================== */
  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header fade-in">
        <div className="app-logo">
          <div className="app-logo-icon">🎬</div>
          <h1 className="app-title">Reel Studio</h1>
        </div>
        <p className="app-subtitle">
          Upload a photo, type a hook — get a finished reel with motion, voiceover,
          music &amp; captions in under 2 minutes.
        </p>
      </header>

      {/* Mode Toggle Tabs */}
      <div className="mode-toggle-tabs fade-in" style={{ display: "flex", gap: 12, marginBottom: 24, justifyContent: "center" }}>
        <button
          className={`mode-tab ${mode === "single" ? "active" : ""}`}
          onClick={() => {
            if (isGenerating) return;
            setMode("single");
            setPipelineError(null);
            setSteps({});
            setFinalResult(null);
          }}
          style={{
            padding: "10px 20px",
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--border-color)",
            background: mode === "single" ? "var(--bg-tertiary)" : "transparent",
            color: mode === "single" ? "var(--accent-cyan)" : "var(--text-secondary)",
            cursor: "pointer",
            fontWeight: 600,
            transition: "all 0.2s",
          }}
        >
          📸 Single Photo
        </button>
        <button
          className={`mode-tab ${mode === "multiclip" ? "active" : ""}`}
          onClick={() => {
            if (isGenerating) return;
            setMode("multiclip");
            setPipelineError(null);
            setSteps({});
            setFinalResult(null);
          }}
          style={{
            padding: "10px 20px",
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--border-color)",
            background: mode === "multiclip" ? "var(--bg-tertiary)" : "transparent",
            color: mode === "multiclip" ? "var(--accent-cyan)" : "var(--text-secondary)",
            cursor: "pointer",
            fontWeight: 600,
            transition: "all 0.2s",
          }}
        >
          🎬 Multi-Clip Editor
        </button>
      </div>

      {/* Input Section */}
      <section className="input-section fade-in">
        {mode === "single" ? (
          /* Upload Zone */
          <div className="input-group">
            <label className="input-label">📸 Your Photo</label>
            <div
              className={`upload-zone glass-card ${dragOver ? "drag-over" : ""} ${
                imagePreview ? "has-image" : ""
              }`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => !imagePreview && fileInputRef.current?.click()}
            >
              {imagePreview ? (
                <>
                  <img
                    src={imagePreview}
                    alt="Upload preview"
                    className="upload-preview"
                  />
                  <button
                    className="upload-remove"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveImage();
                    }}
                  >
                    ✕
                  </button>
                </>
              ) : isUploading ? (
                <>
                  <div className="upload-icon">⏳</div>
                  <p className="upload-text">Uploading...</p>
                </>
              ) : (
                <>
                  <div className="upload-icon">📸</div>
                  <p className="upload-text">
                    <strong>Drop your photo</strong> or click to browse
                  </p>
                  <p className="upload-hint">JPEG, PNG, WebP, GIF · Max 10MB</p>
                </>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                style={{ display: "none" }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileSelect(file);
                }}
              />
            </div>
          </div>
        ) : (
          /* Multi-Clip Video Upload Zone */
          <div className="input-group">
            <label className="input-label">🎬 Raw Video Clips ({videoFiles.length}/5)</label>
            <div
              className={`upload-zone glass-card ${dragOver ? "drag-over" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => videoFiles.length < 5 && videoInputRef.current?.click()}
            >
              {isUploadingVideo ? (
                <>
                  <div className="upload-icon">⏳</div>
                  <p className="upload-text">Uploading clips...</p>
                </>
              ) : (
                <>
                  <div className="upload-icon">🎬</div>
                  <p className="upload-text">
                    <strong>Drag &amp; drop video clips</strong> or click to browse
                  </p>
                  <p className="upload-hint">MP4, MOV, WebM, GIF · Max 20MB per clip</p>
                </>
              )}
              <input
                ref={videoInputRef}
                type="file"
                multiple
                accept="video/mp4,video/quicktime,video/webm,video/x-m4v,image/gif"
                style={{ display: "none" }}
                onChange={(e) => {
                  if (e.target.files) handleVideoSelect(e.target.files);
                }}
              />
            </div>

            {/* Video Thumbnail Grid */}
            {videoPreviews.length > 0 && (
              <div
                className="video-grid"
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))",
                  gap: 12,
                  marginTop: 16,
                }}
              >
                {videoPreviews.map((preview, index) => (
                  <div
                    key={index}
                    className="video-card glass-card"
                    style={{
                      position: "relative",
                      borderRadius: "var(--radius-md)",
                      overflow: "hidden",
                      aspectRatio: "9/16",
                      border: "1px solid var(--border-color)",
                    }}
                  >
                    <video
                      src={preview}
                      muted
                      playsInline
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                      }}
                    />
                    <div
                      style={{
                        position: "absolute",
                        bottom: 4,
                        left: 4,
                        background: "rgba(0,0,0,0.6)",
                        padding: "2px 6px",
                        borderRadius: 4,
                        fontSize: "0.6rem",
                        fontWeight: 600,
                      }}
                    >
                      Clip {index + 1}
                    </div>
                    <button
                      className="video-card-remove"
                      onClick={() => handleRemoveVideo(index)}
                      style={{
                        position: "absolute",
                        top: 4,
                        right: 4,
                        background: "var(--accent-rose)",
                        color: "white",
                        border: "none",
                        width: 20,
                        height: 20,
                        borderRadius: "50%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "0.6rem",
                        cursor: "pointer",
                      }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Hook & Tone */}
        <div className="input-group" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="input-group">
            <label className="input-label" htmlFor="hook-input">
              ✍️ Your Hook / Script
            </label>
            <textarea
              id="hook-input"
              className="text-input"
              placeholder="e.g. This hidden gem changes everything about your morning routine..."
              value={hookText}
              onChange={(e) => setHookText(e.target.value)}
              rows={3}
              maxLength={500}
              style={{ resize: "vertical", minHeight: 80 }}
            />
            <span
              style={{
                fontSize: "0.7rem",
                color: "var(--text-muted)",
                textAlign: "right",
              }}
            >
              {hookText.length}/500
            </span>
          </div>

          <div className="input-group">
            <label className="input-label" htmlFor="tone-select">
              🎨 Tone / Style
            </label>
            <select
              id="tone-select"
              className="select-input"
              value={tone}
              onChange={(e) => setTone(e.target.value as ToneStyle)}
            >
              {TONE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {/* Generate Button */}
      <div className="generate-section fade-in">
        <button
          className="btn btn-primary btn-generate"
          disabled={!canGenerate}
          onClick={handleGenerate}
          id="generate-btn"
        >
          {isGenerating ? (
            <>⚙️ Generating...</>
          ) : isUploading ? (
            <>⏳ Uploading Photo...</>
          ) : (
            <>✨ Generate Reel</>
          )}
        </button>
      </div>

      {/* Error */}
      {pipelineError && (
        <div className="error-message fade-in">
          <span>⚠️</span>
          <span>{pipelineError}</span>
        </div>
      )}

      {/* Pipeline Tracker */}
      {Object.keys(steps).length > 0 && (
        <section className="pipeline-section fade-in">
          <div className="pipeline-header">
            <h2 className="pipeline-title">🔄 Pipeline</h2>
            <div className="cost-ticker">
              <div className="cost-ticker-item">
                <span className="cost-ticker-label">Cost:</span>
                <span className="cost-ticker-value">
                  ${totalCost.toFixed(4)}
                </span>
              </div>
              <div className="cost-ticker-divider" />
              <div className="cost-ticker-item">
                <span className="cost-ticker-label">Time:</span>
                <span className="cost-ticker-value time">
                  {(totalTime / 1000).toFixed(1)}s
                </span>
              </div>
            </div>
          </div>

          <div className="pipeline-tracker">
            {(mode === "single" ? STEP_DEFINITIONS : MULTICLIP_STEP_DEFINITIONS).map((def) => {
              const step = steps[def.step];
              const status = step?.status || "idle";
              return (
                <div
                  key={def.step}
                  className={`pipeline-step glass-card step-${status}`}
                >
                  <div className="step-icon-wrapper">{def.icon}</div>
                  <div className="step-name">{def.name}</div>
                  <div className="step-model">{def.modelId.split("/").slice(-1)}</div>
                  <div className="step-meta">
                    {status === "running" && (
                      <span className="step-timer">
                        {((step?.elapsedMs || 0) / 1000).toFixed(1)}s
                      </span>
                    )}
                    {status === "completed" && (
                      <>
                        <span className="step-timer">
                          {((step?.durationMs || 0) / 1000).toFixed(1)}s
                        </span>
                        <span className="step-cost">
                          ${(step?.costUsd || 0).toFixed(4)}
                        </span>
                      </>
                    )}
                    {status === "failed" && (
                      <>
                        <span style={{ color: "var(--accent-rose)", fontSize: "0.7rem" }}>
                          {step?.error || "Failed"}
                        </span>
                      </>
                    )}
                    {status === "queued" && (
                      <span style={{ color: "var(--text-muted)" }}>Queued</span>
                    )}
                    {status === "idle" && (
                      <span style={{ color: "var(--text-muted)" }}>Waiting</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Preview Cards */}
      {Object.keys(steps).length > 0 && (
        <section className="preview-section fade-in">
          <div className="preview-grid">
            {/* Video Preview */}
            <div className="preview-card glass-card">
              <div className="preview-card-header">
                <span className="preview-card-title">🎬 Video</span>
                <span
                  className={`preview-card-status ${
                    steps[1]?.status === "completed"
                      ? "done"
                      : steps[1]?.status === "running"
                      ? "generating"
                      : steps[1]?.status === "failed"
                      ? "error"
                      : "waiting"
                  }`}
                >
                  {steps[1]?.status === "completed"
                    ? "✓ Ready"
                    : steps[1]?.status === "running"
                    ? "Processing..."
                    : steps[1]?.status === "failed"
                    ? "Failed"
                    : "Waiting"}
                </span>
              </div>
              <div className="preview-content">
                {steps[1]?.status === "completed" && steps[1]?.resultUrl ? (
                  mode === "single" ? (
                    <video
                      className="preview-video"
                      src={steps[1].resultUrl}
                      controls
                      autoPlay
                      muted
                      loop
                    />
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <video
                        className="preview-video"
                        src={steps[1].resultUrl}
                        controls
                        autoPlay
                        muted
                        loop
                      />
                      <p style={{ fontSize: "0.7rem", color: "var(--text-muted)", margin: 0 }}>
                        Frame analysis complete
                      </p>
                    </div>
                  )
                ) : steps[1]?.status === "running" ? (
                  <div style={{ width: "100%", position: "relative" }}>
                    {mode === "single" && imagePreview ? (
                      <img
                        src={imagePreview}
                        alt="Processing"
                        style={{
                          width: "100%",
                          maxHeight: 180,
                          objectFit: "cover",
                          borderRadius: "var(--radius-md)",
                          filter: "blur(4px) brightness(0.7)",
                        }}
                      />
                    ) : (
                      videoPreviews[0] && (
                        <video
                          src={videoPreviews[0]}
                          muted
                          style={{
                            width: "100%",
                            maxHeight: 180,
                            objectFit: "cover",
                            borderRadius: "var(--radius-md)",
                            filter: "blur(4px) brightness(0.7)",
                          }}
                        />
                      )
                    )}
                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background: "rgba(0,0,0,0.3)",
                        borderRadius: "var(--radius-md)",
                      }}
                    >
                      <span style={{ fontSize: "1.5rem" }}>🎬</span>
                    </div>
                  </div>
                ) : (
                  <div className="preview-skeleton" />
                )}
              </div>
            </div>

            {/* Voiceover Preview */}
            <div className="preview-card glass-card">
              <div className="preview-card-header">
                <span className="preview-card-title">🎙️ Voiceover</span>
                <span
                  className={`preview-card-status ${
                    steps[mode === "single" ? 2 : 3]?.status === "completed"
                      ? "done"
                      : steps[mode === "single" ? 2 : 3]?.status === "running"
                      ? "generating"
                      : steps[mode === "single" ? 2 : 3]?.status === "failed"
                      ? "error"
                      : "waiting"
                  }`}
                >
                  {steps[mode === "single" ? 2 : 3]?.status === "completed"
                    ? "✓ Ready"
                    : steps[mode === "single" ? 2 : 3]?.status === "running"
                    ? "Generating..."
                    : steps[mode === "single" ? 2 : 3]?.status === "failed"
                    ? "Failed"
                    : "Waiting"}
                </span>
              </div>
              <div className="preview-content">
                {steps[mode === "single" ? 2 : 3]?.status === "completed" && steps[mode === "single" ? 2 : 3]?.resultUrl ? (
                  <div className="preview-audio-wrapper">
                    <WaveformVisualization color="var(--accent-violet)" animated={false} />
                    <audio
                      className="preview-audio"
                      src={steps[mode === "single" ? 2 : 3].resultUrl}
                      controls
                    />
                  </div>
                ) : steps[mode === "single" ? 2 : 3]?.status === "running" ? (
                  <WaveformVisualization color="var(--accent-violet)" animated={true} />
                ) : (
                  <div className="preview-skeleton" />
                )}
              </div>
            </div>

            {/* Music Preview */}
            <div className="preview-card glass-card">
              <div className="preview-card-header">
                <span className="preview-card-title">🎵 Music</span>
                <span
                  className={`preview-card-status ${
                    steps[mode === "single" ? 3 : 4]?.status === "completed"
                      ? "done"
                      : steps[mode === "single" ? 3 : 4]?.status === "running"
                      ? "generating"
                      : steps[mode === "single" ? 3 : 4]?.status === "failed"
                      ? "error"
                      : "waiting"
                  }`}
                >
                  {steps[mode === "single" ? 3 : 4]?.status === "completed"
                    ? "✓ Ready"
                    : steps[mode === "single" ? 3 : 4]?.status === "running"
                    ? "Generating..."
                    : steps[mode === "single" ? 3 : 4]?.status === "failed"
                    ? "Failed"
                    : "Waiting"}
                </span>
              </div>
              <div className="preview-content">
                {steps[mode === "single" ? 3 : 4]?.status === "completed" && steps[mode === "single" ? 3 : 4]?.resultUrl ? (
                  <div className="preview-audio-wrapper">
                    <WaveformVisualization color="var(--accent-cyan)" animated={false} />
                    <audio
                      className="preview-audio"
                      src={steps[mode === "single" ? 3 : 4].resultUrl}
                      controls
                    />
                  </div>
                ) : steps[mode === "single" ? 3 : 4]?.status === "running" ? (
                  <WaveformVisualization color="var(--accent-cyan)" animated={true} />
                ) : (
                  <div className="preview-skeleton" />
                )}
              </div>
            </div>

            {/* Storyboard (Multi-Clip Mode Only) */}
            {mode === "multiclip" && (
              <div className="preview-card glass-card">
                <div className="preview-card-header">
                  <span className="preview-card-title">📋 Storyboard &amp; Script</span>
                  <span
                    className={`preview-card-status ${
                      steps[2]?.status === "completed"
                        ? "done"
                        : steps[2]?.status === "running"
                        ? "generating"
                        : "waiting"
                    }`}
                  >
                    {steps[2]?.status === "completed"
                      ? "✓ Created"
                      : steps[2]?.status === "running"
                      ? "Writing..."
                      : "Waiting"}
                  </span>
                </div>
                <div className="preview-content" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {steps[2]?.status === "completed" && steps[2]?.inputSummary ? (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 10,
                        fontSize: "0.75rem",
                        color: "var(--text-secondary)",
                        padding: 10,
                        background: "rgba(255,255,255,0.03)",
                        borderRadius: "var(--radius-sm)",
                      }}
                    >
                      <div>
                        <strong>Mapping:</strong> {steps[2].inputSummary}
                      </div>
                      <div style={{ fontStyle: "italic", borderLeft: "2px solid var(--accent-cyan)", paddingLeft: 8 }}>
                        {steps[3]?.inputSummary || "Voiceover text ready"}
                      </div>
                    </div>
                  ) : (
                    <div className="preview-skeleton" style={{ display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: "0.8rem" }}>
                      Edit plan will appear here
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Final Result */}
      {finalResult?.finalUrl && (
        <section className="final-result glass-card fade-in">
          <h2 className="final-result-title">🎉 Your Reel is Ready!</h2>
          <p className="final-result-subtitle">
            {finalResult.partial
              ? "Composed with available assets (some steps failed)"
              : "All steps completed successfully"}
          </p>
          <div className="final-video-container">
            <video
              className="final-video"
              src={finalResult.finalUrl}
              controls
              autoPlay
              loop
            />
          </div>
          <div className="final-actions">
            <a
              href={finalResult.finalUrl}
              download="reel.mp4"
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-primary"
            >
              ⬇️ Download Reel
            </a>
            <button
              className="btn btn-secondary"
              onClick={() => {
                navigator.clipboard.writeText(finalResult.finalUrl || "");
                alert("Link copied to clipboard!");
              }}
            >
              🔗 Copy Link
            </button>
          </div>
        </section>
      )}

      {/* Execution Trace */}
      {Object.keys(steps).length > 0 && (
        <section className="trace-section fade-in">
          <button
            className="trace-toggle"
            onClick={() => setTraceOpen(!traceOpen)}
          >
            <span className={`trace-toggle-icon ${traceOpen ? "open" : ""}`}>
              ▶
            </span>
            <span>Execution Trace</span>
            <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>
              ({Object.values(steps).filter((s) => s.status !== "idle").length} calls)
            </span>
          </button>

          {traceOpen && (
            <div className="trace-table-wrapper glass-card" style={{ padding: 16 }}>
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
                  {(mode === "single" ? STEP_DEFINITIONS : MULTICLIP_STEP_DEFINITIONS).map((def) => {
                    const step = steps[def.step];
                    if (!step) return null;
                    return (
                      <tr key={def.step}>
                        <td style={{ fontWeight: 600 }}>
                          {def.icon} {def.name}
                        </td>
                        <td>
                          <code
                            style={{
                              fontSize: "0.7rem",
                              background: "var(--bg-tertiary)",
                              padding: "2px 6px",
                              borderRadius: 4,
                            }}
                          >
                            {step.modelId}
                          </code>
                        </td>
                        <td>
                          <span className={`trace-status ${step.status}`}>
                            {step.status === "completed"
                              ? "✓"
                              : step.status === "failed"
                              ? "✕"
                              : step.status === "running"
                              ? "●"
                              : "○"}{" "}
                            {step.status}
                          </span>
                        </td>
                        <td>
                          {step.durationMs
                            ? `${(step.durationMs / 1000).toFixed(1)}s`
                            : step.status === "running"
                            ? `${(step.elapsedMs / 1000).toFixed(1)}s`
                            : "—"}
                        </td>
                        <td>
                          {step.costUsd
                            ? `$${step.costUsd.toFixed(4)}`
                            : "—"}
                        </td>
                        <td style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {step.inputSummary || "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

/* ==============================
   Waveform Visualization
   ============================== */
function WaveformVisualization({
  color,
  animated,
}: {
  color: string;
  animated: boolean;
}) {
  const bars = 24;
  return (
    <div className="preview-waveform">
      {Array.from({ length: bars }, (_, i) => {
        const baseHeight = 8 + Math.sin(i * 0.7) * 16 + Math.random() * 12;
        return (
          <div
            key={i}
            className="waveform-bar"
            style={{
              height: baseHeight,
              background: color,
              opacity: animated ? undefined : 0.5,
              animation: animated
                ? `waveform-bounce 0.8s ease-in-out ${i * 0.05}s infinite alternate`
                : "none",
            }}
          />
        );
      })}
      <style>{`
        @keyframes waveform-bounce {
          0% { height: 6px; }
          100% { height: ${16 + Math.random() * 24}px; }
        }
      `}</style>
    </div>
  );
}
