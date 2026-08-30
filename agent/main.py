import os
import sys
import subprocess
from pathlib import Path
from agent.config import TEMP_DIR
from agent.transcriber import transcribe_audio
from agent.planner import detect_silence_gaps, plan_creative_elements
from agent.composer import download_pexels_broll, generate_fcpxml, import_to_davinci

def extract_audio_from_video(video_path, output_audio_path):
    """
    Extracts a 16kHz mono WAV file from a video source for Whisper.
    """
    print(f"[+] Extracting audio for Whisper: {video_path} -> {output_audio_path}")
    command = [
        "ffmpeg",
        "-i", video_path,
        "-y",               # Overwrite output
        "-vn",              # Disable video recording
        "-acodec", "pcm_s16le",
        "-ar", "16000",     # 16kHz sample rate
        "-ac", "1",         # Mono channel
        output_audio_path
    ]
    
    try:
        # Run subprocess silently
        subprocess.run(command, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return output_audio_path
    except subprocess.CalledProcessError as e:
        print(f"[-] FFmpeg audio extraction failed: {e}")
        # Try a simpler convert command
        try:
            print("    - Retrying with basic conversion...")
            subprocess.run(["ffmpeg", "-i", video_path, "-y", output_audio_path], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            return output_audio_path
        except Exception:
            raise RuntimeError(f"FFmpeg extraction failed. Ensure FFmpeg is installed and added to your system PATH.")

def get_video_duration(video_path):
    """
    Retrieves video file duration in seconds using ffprobe.
    """
    cmd = [
        "ffprobe",
        "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        video_path
    ]
    try:
        result = subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        return float(result.stdout.strip())
    except Exception as e:
        print(f"[*] Warning: Could not retrieve video duration via ffprobe ({e}). Defaulting to 10.0 seconds.")
        return 10.0

def run_agent_pipeline(video_path):
    video_path = os.path.abspath(video_path)
    if not os.path.exists(video_path):
        print(f"[-] Input video file does not exist: {video_path}")
        sys.exit(1)
        
    video_name = Path(video_path).stem
    job_dir = TEMP_DIR / f"job_{video_name}"
    job_dir.mkdir(exist_ok=True)
    
    # Step 1: Audio Extraction & Duration Probe
    temp_wav_path = str(job_dir / "audio_extract.wav")
    extract_audio_from_video(video_path, temp_wav_path)
    video_duration = get_video_duration(video_path)
    
    # Step 2: Transcription with Word Timestamps
    # Attempt local faster-whisper first, fall back to fal.ai cloud Whisper API
    words = transcribe_audio(temp_wav_path, local_first=True)
    if words is None:
        print("[-] Transcription failed. Exiting.")
        sys.exit(1)
        
    if len(words) == 0:
        print("[*] No speech detected in video. Proceeding with silent timeline cuts.")
        
    # Save transcription transcript for logging
    with open(job_dir / "whisper_transcript.json", "w", encoding="utf-8") as f:
        json_data = {"words": words}
        import json
        json.dump(json_data, f, indent=2)
        
    print(f"[+] Transcribed {len(words)} words.")
    
    # Step 3: Silence Trimming (Local calculations)
    active_segments = detect_silence_gaps(words, video_duration, max_gap=0.35)
    print(f"[+] Programmatic silence removal completed: Kept {len(active_segments)} segments.")
    
    # Step 4: Creative Plan generation via DeepSeek-R1
    edit_plan = plan_creative_elements(words, active_segments)
    
    # Save edit plan for logging
    with open(job_dir / "edit_plan.json", "w", encoding="utf-8") as f:
        json.dump(edit_plan, f, indent=2)
        
    # Step 5: B-roll Search and Downloads
    brolls = edit_plan.get("brolls", [])
    broll_paths = {}
    
    for b in brolls:
        query = b["query"]
        if query not in broll_paths:
            # Download vertical clips to our temporary job directory
            path = download_pexels_broll(query, str(job_dir))
            if path:
                broll_paths[query] = path

    # Step 6: FCPXML Timeline Compilation
    fcpxml_path = str(job_dir / "edit_timeline.fcpxml")
    generate_fcpxml(
        a_roll_path=video_path,
        active_segments=active_segments,
        edit_plan=edit_plan,
        broll_paths=broll_paths,
        output_xml_path=fcpxml_path
    )
    
    # Step 7: Import directly into DaVinci Resolve
    resolve_success = import_to_davinci(fcpxml_path)
    
    print("\n" + "="*50)
    if resolve_success:
        print("[+] SUCCESS: Timeline successfully compiled and imported to DaVinci Resolve!")
    else:
        print("[*] DaVinci Resolve connection bypassed/failed. Triggering headless FFmpeg fallback...")
        
        # Step 8: Headless FFmpeg fallback rendering
        # Generate ASS subtitle styling file
        ass_path = str(job_dir / "styled_captions.ass")
        from agent.renderer import generate_ass_file, render_video_with_ffmpeg
        
        generate_ass_file(edit_plan.get("captions", []), ass_path)
        
        output_mp4_path = str(job_dir / f"final_{video_name}.mp4")
        render_success = render_video_with_ffmpeg(
            a_roll_path=video_path,
            active_segments=active_segments,
            edit_plan=edit_plan,
            broll_paths=broll_paths,
            ass_path=ass_path,
            output_mp4_path=output_mp4_path
        )
        
        if render_success:
            print(f"[+] HEADLESS SUCCESS: Final vertical reel compiled successfully!")
            print(f"    - Rendered output: '{output_mp4_path}'")
        else:
            print("[-] Headless render failed. However, FCPXML and transcripts are available in the job directory.")
            print(f"    - FCPXML path: '{fcpxml_path}'")
    print("="*50)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python agent/main.py <path_to_raw_video>")
        sys.exit(1)
        
    raw_video = sys.argv[1]
    run_agent_pipeline(raw_video)
