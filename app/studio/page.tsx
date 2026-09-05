"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import {
  STEP_DEFINITIONS,
  MULTICLIP_STEP_DEFINITIONS,
  TEMPLATE_CATALOG,
  type StepEvent,
  type ToneStyle,
  type PipelineMode,
} from "@/lib/pipeline";
import {
  BrandBar,
  ModeToggle,
  TemplateCatalog,
  UploadZone,
  ClipGrid,
  HookInput,
  ResumeCard,
  GenerateButton,
  PipelineStepper,
  PreviewCard,
  Waveform,
  FinalResult,
  TracePanel,
  ErrorBanner,
} from "@/components/studio-ui";
import {
  IconFilm,
  IconMic,
  IconMusic,
  IconScissors,
  IconScript,
  IconScan,
  IconLayers,
} from "@/components/icons";

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
  /* --- Passcode Auth Gate --- */
  const [passcode, setPasscode] = useState("");
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [authError, setAuthError] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("reeltrix_studio_authorized");
    if (saved === "true") {
      setIsAuthorized(true);
    }
  }, []);

  const handleAuthSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (passcode.trim() === "reeltrix2026") {
      localStorage.setItem("reeltrix_studio_authorized", "true");
      setIsAuthorized(true);
      setAuthError(false);
    } else {
      setAuthError(true);
    }
  };

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

  /* --- Cache / Resume Pipeline State --- */
  const [resumePipeline, setResumePipeline] = useState(true);
  const [cachedVideoUrl, setCachedVideoUrl] = useState<string | null>(null);
  const [cachedVoiceoverUrl, setCachedVoiceoverUrl] = useState<string | null>(null);
  const [cachedMusicUrl, setCachedMusicUrl] = useState<string | null>(null);
  const [cachedCaptions, setCachedCaptions] = useState<any[] | null>(null);
  const [cachedEditPlan, setCachedEditPlan] = useState<any | null>(null);

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

  // Clear cache if inputs change to prevent mismatched stages
  useEffect(() => {
    setCachedVideoUrl(null);
    setCachedVoiceoverUrl(null);
    setCachedMusicUrl(null);
  }, [imageUrl]);

  useEffect(() => {
    setCachedCaptions(null);
    setCachedEditPlan(null);
    setCachedVoiceoverUrl(null);
    setCachedMusicUrl(null);
  }, [videoUrls]);

  useEffect(() => {
    setCachedVideoUrl(null);
    setCachedVoiceoverUrl(null);
    setCachedEditPlan(null);
  }, [hookText]);

  useEffect(() => {
    setCachedMusicUrl(null);
    setCachedEditPlan(null);
  }, [tone]);

  useEffect(() => {
    setCachedVideoUrl(null);
    setCachedVoiceoverUrl(null);
    setCachedMusicUrl(null);
    setCachedCaptions(null);
    setCachedEditPlan(null);
  }, [mode]);

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
      if (file.size > 50 * 1024 * 1024) {
        alert(`${file.name} is too large. Max 50MB.`);
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
      const payload: Record<string, any> = mode === "single"
        ? { imageUrl, hookText: hookText.trim(), tone }
        : { videoUrls, hookText: hookText.trim(), tone };

      if (resumePipeline) {
        if (mode === "single") {
          if (cachedVideoUrl) payload.existingVideoUrl = cachedVideoUrl;
          if (cachedVoiceoverUrl) payload.existingVoiceoverUrl = cachedVoiceoverUrl;
          if (cachedMusicUrl) payload.existingMusicUrl = cachedMusicUrl;
        } else {
          if (cachedCaptions) payload.existingCaptions = cachedCaptions;
          if (cachedEditPlan) payload.existingEditPlan = cachedEditPlan;
          if (cachedVoiceoverUrl) payload.existingVoiceoverUrl = cachedVoiceoverUrl;
          if (cachedMusicUrl) payload.existingMusicUrl = cachedMusicUrl;
        }
      }

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
        const stepData = data as any;
        setSteps((prev) => ({
          ...prev,
          [stepData.step]: {
            ...prev[stepData.step],
            ...stepData,
            elapsedMs: stepData.durationMs || prev[stepData.step]?.elapsedMs || 0,
          },
        }));

        // Cache completed steps
        if (stepData.status === "completed") {
          if (mode === "single") {
            if (stepData.step === 1 && stepData.resultUrl) {
              setCachedVideoUrl(stepData.resultUrl);
            }
            if (stepData.step === 2 && stepData.resultUrl) {
              setCachedVoiceoverUrl(stepData.resultUrl);
            }
            if (stepData.step === 3 && stepData.resultUrl) {
              setCachedMusicUrl(stepData.resultUrl);
            }
          } else {
            if (stepData.step === 1 && stepData.processedClips) {
              setCachedCaptions(stepData.processedClips);
            }
            if (stepData.step === 2 && stepData.editPlan) {
              setCachedEditPlan(stepData.editPlan);
            }
            if (stepData.step === 3) {
              if (stepData.voiceoverUrl) setCachedVoiceoverUrl(stepData.voiceoverUrl);
              if (stepData.musicUrl) setCachedMusicUrl(stepData.musicUrl);
            }
          }
        }
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

  // Compute what can be skipped and the savings
  const hasCache = mode === "single"
    ? (!!cachedVideoUrl || !!cachedVoiceoverUrl || !!cachedMusicUrl)
    : (!!cachedCaptions || !!cachedEditPlan || !!cachedVoiceoverUrl || !!cachedMusicUrl);

  let savedCost = 0;
  let savedTimeSec = 0;
  let skippedStepsCount = 0;

  if (hasCache && resumePipeline) {
    if (mode === "single") {
      if (cachedVideoUrl) {
        savedCost += 0.28;
        savedTimeSec += 15;
        skippedStepsCount++;
      }
      if (cachedVoiceoverUrl) {
        const charCount = hookText.length;
        savedCost += Math.max((charCount / 1000) * 0.1, 0.01);
        savedTimeSec += 2;
        skippedStepsCount++;
      }
      if (cachedMusicUrl) {
        savedCost += 0.02;
        savedTimeSec += 5;
        skippedStepsCount++;
      }
    } else {
      if (cachedCaptions) {
        savedCost += videoUrls.length * 0.005;
        savedTimeSec += videoUrls.length * 2;
        skippedStepsCount++;
      }
      if (cachedEditPlan) {
        savedCost += 0.002;
        savedTimeSec += 2;
        skippedStepsCount++;
      }
      if (cachedVoiceoverUrl) {
        // approximate char count of combined voiceover
        const editPlanText = cachedEditPlan
          ? `${cachedEditPlan.hook.voiceover} ${cachedEditPlan.body.voiceover} ${cachedEditPlan.cta.voiceover}`
          : hookText;
        savedCost += Math.max((editPlanText.length / 1000) * 0.1, 0.01);
        savedTimeSec += 2;
        skippedStepsCount++;
      }
      if (cachedMusicUrl) {
        savedCost += 0.02;
        savedTimeSec += 5;
        skippedStepsCount++;
      }
    }
  }

  /* --- Preview helpers --- */
  type PreviewState = "waiting" | "generating" | "done" | "error";
  const previewStatus = (st?: StepState): PreviewState => {
    if (!st) return "waiting";
    switch (st.status) {
      case "completed": return "done";
      case "running": return "generating";
      case "failed": return "error";
      default: return "waiting";
    }
  };
  const previewLabel = (st?: StepState): string => {
    if (!st) return "Waiting";
    switch (st.status) {
      case "completed": return "Ready";
      case "running": return "Processing…";
      case "failed": return "Failed";
      default: return "Waiting";
    }
  };

  const videoStep = steps[1];
  const voiceStep = steps[mode === "single" ? 2 : 3];
  const musicStep = steps[mode === "single" ? 3 : 4];
  const storyStep = steps[2];
  const hasSteps = Object.keys(steps).length > 0;

  const stepIcons =
    mode === "single"
      ? [IconFilm, IconMic, IconMusic, IconScissors]
      : [IconScan, IconScript, IconMusic, IconScissors];

  const genLabel = isGenerating
    ? "Generating"
    : isUploading
    ? "Uploading…"
    : isUploadingVideo
    ? "Uploading clips…"
    : "Generate Reel";

  /* ==============================
     Render Auth Gate
     ============================== */
  if (!isAuthorized) {
    return (
      <div className="auth-gate" style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#070708",
        padding: "24px"
      }}>
        <div style={{
          maxWidth: "400px",
          width: "100%",
          backgroundColor: "#111113",
          border: "1px solid #27272A",
          borderRadius: "16px",
          padding: "32px",
          textAlign: "center",
          boxShadow: "0 10px 30px rgba(0,0,0,0.6)"
        }}>
          <div style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: "48px",
            height: "48px",
            borderRadius: "12px",
            background: "linear-gradient(135deg, #00E676 0%, #00C853 100%)",
            color: "#070708",
            fontWeight: "bold",
            fontSize: "20px",
            marginBottom: "24px",
            boxShadow: "0 0 16px rgba(0,230,118,0.25)"
          }}>
            RT
          </div>
          <h2 style={{
            fontFamily: "'Outfit', sans-serif",
            fontSize: "24px",
            fontWeight: 600,
            color: "#FAFAFA",
            marginBottom: "8px"
          }}>Reeltrix Studio</h2>
          <p style={{
            fontSize: "14px",
            color: "#A1A1AA",
            marginBottom: "24px"
          }}>Enter secret access key to load editor</p>
          <form onSubmit={handleAuthSubmit} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <input
              type="password"
              placeholder="••••••••"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              style={{
                width: "100%",
                height: "44px",
                backgroundColor: "#070708",
                border: authError ? "1px solid #F87171" : "1px solid #27272A",
                borderRadius: "8px",
                padding: "0 16px",
                color: "#FAFAFA",
                textAlign: "center",
                fontSize: "16px",
                letterSpacing: "4px",
                outline: "none",
                transition: "border-color 0.2s ease"
              }}
            />
            {authError && (
              <p style={{ color: "#F87171", fontSize: "12px", marginTop: "-4px" }}>
                Incorrect access key
              </p>
            )}
            <button type="submit" style={{
              height: "44px",
              backgroundColor: "#00E676",
              color: "#070708",
              border: "none",
              borderRadius: "8px",
              fontWeight: 600,
              fontSize: "14px",
              cursor: "pointer",
              transition: "background-color 0.2s ease"
            }}
            onMouseOver={(e) => e.currentTarget.style.backgroundColor = "#00C853"}
            onMouseOut={(e) => e.currentTarget.style.backgroundColor = "#00E676"}
            >
              Access Studio
            </button>
          </form>
        </div>
      </div>
    );
  }

  /* ==============================
     Render Studio Page
     ============================== */
  return (
    <div className="app">
      <BrandBar />

      <div className="app-shell">
        {/* ── Config rail ─────────────────── */}
        <aside className="rail">
          <ModeToggle
            mode={mode}
            disabled={isGenerating}
            onChange={(m) => {
              setMode(m);
              setPipelineError(null);
              setSteps({});
              setFinalResult(null);
            }}
          />

          <TemplateCatalog
            templates={TEMPLATE_CATALOG}
            selected={tone}
            disabled={isGenerating}
            onSelect={(t) => setTone(t)}
          />

          {mode === "single" ? (
            <UploadZone
              label="Your photo"
              hint="JPEG, PNG, WebP, GIF · Max 10MB"
              accept="image/jpeg,image/png,image/webp,image/gif"
              preview={imagePreview}
              isUploading={isUploading}
              disabled={isGenerating}
              onSelect={(files) => {
                const f = files?.[0];
                if (f) handleFileSelect(f);
              }}
              onRemove={handleRemoveImage}
            />
          ) : (
            <>
              <UploadZone
                label={`Raw clips (${videoFiles.length}/5)`}
                hint="MP4, MOV, WebM, GIF · Max 50MB each"
                accept="video/mp4,video/quicktime,video/webm,video/x-m4v,image/gif"
                multiple
                isUploading={isUploadingVideo}
                disabled={isGenerating}
                onSelect={(files) => {
                  if (files) handleVideoSelect(files);
                }}
              />
              {videoPreviews.length > 0 && (
                <ClipGrid previews={videoPreviews} onRemove={handleRemoveVideo} />
              )}
            </>
          )}

          <HookInput value={hookText} onChange={setHookText} maxLength={500} />

          {hasCache && (
            <ResumeCard
              checked={resumePipeline}
              onToggle={setResumePipeline}
              skips={skippedStepsCount}
              cost={savedCost}
              timeSec={savedTimeSec}
            />
          )}

          <GenerateButton
            label={genLabel}
            loading={isGenerating}
            disabled={!canGenerate}
            onClick={handleGenerate}
          />

          {pipelineError && <ErrorBanner message={pipelineError} />}
        </aside>

        {/* ── Stage ────────────────────────── */}
        <main className="stage">
          {hasSteps && (
            <PipelineStepper
              steps={steps}
              definitions={mode === "single" ? STEP_DEFINITIONS : MULTICLIP_STEP_DEFINITIONS}
              icons={stepIcons}
              totalCost={totalCost}
              totalTime={totalTime}
            />
          )}

          {hasSteps && (
            <section className="preview-grid fade-in">
              <PreviewCard
                icon={<IconFilm size={16} />}
                title="Video"
                status={previewStatus(videoStep)}
                statusLabel={previewLabel(videoStep)}
              >
                {videoStep?.status === "completed" && videoStep.resultUrl ? (
                  <video
                     className="preview-video"
                     src={videoStep.resultUrl}
                     controls
                     autoPlay
                     muted
                     loop
                   />
                ) : videoStep?.status === "running" ? (
                  <div style={{ width: "100%", position: "relative" }}>
                    {mode === "single" && imagePreview ? (
                      <img className="preview-blur" src={imagePreview} alt="Processing" />
                    ) : videoPreviews[0] ? (
                      <video className="preview-blur" src={videoPreviews[0]} muted />
                    ) : null}
                    <div className="preview-blur-overlay">
                      <IconFilm size={26} />
                    </div>
                  </div>
                ) : (
                  <div className="preview-skeleton" />
                )}
              </PreviewCard>

              <PreviewCard
                icon={<IconMic size={16} />}
                title="Voiceover"
                status={previewStatus(voiceStep)}
                statusLabel={previewLabel(voiceStep)}
              >
                {voiceStep?.status === "completed" && voiceStep.resultUrl ? (
                  <div className="preview-audio-wrap">
                    <Waveform color="var(--brand-1)" />
                    <audio className="preview-audio" src={voiceStep.resultUrl} controls />
                  </div>
                ) : voiceStep?.status === "running" ? (
                  <Waveform color="var(--brand-1)" animated />
                ) : (
                  <div className="preview-skeleton" />
                )}
              </PreviewCard>

              <PreviewCard
                icon={<IconMusic size={16} />}
                title="Music"
                status={previewStatus(musicStep)}
                statusLabel={previewLabel(musicStep)}
              >
                {musicStep?.status === "completed" && musicStep.resultUrl ? (
                  <div className="preview-audio-wrap">
                    <Waveform color="var(--brand-3)" />
                    <audio className="preview-audio" src={musicStep.resultUrl} controls />
                  </div>
                ) : musicStep?.status === "running" ? (
                  <Waveform color="var(--brand-3)" animated />
                ) : (
                  <div className="preview-skeleton" />
                )}
              </PreviewCard>

              {mode === "multiclip" && (
                <PreviewCard
                  icon={<IconLayers size={16} />}
                  title="Storyboard & script"
                  status={previewStatus(storyStep)}
                  statusLabel={storyStep?.status === "completed" ? "Created" : previewLabel(storyStep)}
                  className="preview-card--full"
                >
                  {storyStep?.status === "completed" && storyStep?.inputSummary ? (
                    <div className="preview-story">
                      <div className="preview-story-row">
                        <strong>Mapping:</strong> {storyStep.inputSummary}
                      </div>
                      <div className="preview-story-row preview-story-quote">
                        {steps[3]?.inputSummary || "Voiceover text ready"}
                      </div>
                    </div>
                  ) : (
                    <div className="preview-skeleton preview-skeleton--text">
                      Edit plan will appear here
                    </div>
                  )}
                </PreviewCard>
              )}
            </section>
          )}

          {finalResult?.finalUrl && (
            <div className="fade-in">
              <FinalResult
                result={finalResult}
                onCopy={() => {
                  navigator.clipboard.writeText(finalResult.finalUrl || "");
                  alert("Link copied to clipboard!");
                }}
              />
            </div>
          )}

          {hasSteps && (
            <TracePanel
              open={traceOpen}
              onToggle={() => setTraceOpen((v) => !v)}
              steps={steps}
              definitions={mode === "single" ? STEP_DEFINITIONS : MULTICLIP_STEP_DEFINITIONS}
              callCount={Object.values(steps).filter((s) => s.status !== "idle").length}
            />
          )}
        </main>
      </div>
    </div>
  );
}
