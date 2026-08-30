import os
import sys
import subprocess
from agent.config import TEMP_DIR

def generate_ass_file(captions, ass_path):
    """
    Generates a stylized Advanced SubStation Alpha (ASS) file.
    Supports bold typography, heavy borders, highlights, and vertical centering.
    """
    print(f"[+] Creating ASS subtitle file: {ass_path}")
    
    # ASS format structure
    content = [
        "[Script Info]",
        "ScriptType: v4.00+",
        "PlayResX: 1080",
        "PlayResY: 1920",
        "",
        "[V4+ Styles]",
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
        # Style: Primary (White: &H00FFFFFF), Outline (Black: &H00000000), Shadow (Semi-transparent black: &H80000000)
        # Alignment 5: Centered vertically and horizontally
        "Style: Default,Montserrat,68,&H00FFFFFF,&H0000FFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,6,2,5,10,10,960,1",
        "",
        "[Events]",
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text"
    ]
    
    def format_timestamp(seconds):
        h = int(seconds // 3600)
        m = int((seconds % 3600) // 60)
        s = int(seconds % 60)
        ms = int(round((seconds - int(seconds)) * 100))
        return f"{h:01d}:{m:02d}:{s:02d}.{ms:02d}"

    for cap in captions:
        start_t = format_timestamp(cap["start"])
        end_t = format_timestamp(cap["end"])
        text = cap["text"]
        emoji = cap.get("emoji", "")
        
        # Color highlight logic: Wrap specified color words in ASS tags (e.g. {\c&H0000FFFF&}word{\c&H00FFFFFF&})
        color_words = cap.get("color_words", [])
        formatted_text = text
        for w in color_words:
            # Replace target word with colored version (Yellow: &H0000FFFF)
            formatted_text = formatted_text.replace(w, f"{{\\c&H0000FFFF&}}{w}{{\\c&H00FFFFFF&}}")
            
        if emoji:
            formatted_text = f"{emoji} {formatted_text}"
            
        content.append(f"Dialogue: 0,{start_t},{end_t},Default,,0,0,0,,{formatted_text}")

    with open(ass_path, "w", encoding="utf-8") as f:
        f.write("\n".join(content))
    return ass_path

def render_video_with_ffmpeg(a_roll_path, active_segments, edit_plan, broll_paths, ass_path, output_mp4_path):
    """
    Headless video compiler executing cuts, zooms, B-rolls, audio mixing, and subtitle burn-ins.
    Runs entirely via a single FFmpeg execution pass.
    """
    print("[+] Compiling video headlessly with FFmpeg...")
    
    # Filter out cuts flagged for removal
    removals = edit_plan.get("removals", [])
    final_segments = []
    for seg in active_segments:
        s, e = seg["start"], seg["end"]
        keep = True
        for rem in removals:
            if rem["start"] <= s and rem["end"] >= e:
                keep = False
                break
            elif rem["start"] > s and rem["start"] < e:
                e = rem["start"]
            elif rem["end"] > s and rem["end"] < e:
                s = rem["end"]
        if keep and (e - s) > 0.1:
            final_segments.append({"start": s, "end": e})

    if not final_segments:
        print("[-] Error: No active segments to render.")
        return False

    # Build input files array
    inputs = ["-i", a_roll_path]
    broll_map = {}
    for idx, (query, path) in enumerate(broll_paths.items()):
        inputs.extend(["-i", path])
        broll_map[query] = idx + 1 # Input index (0 is A-roll)

    # Compile complex filter graph
    filter_complex = []
    video_outputs = []
    audio_outputs = []
    
    zooms = edit_plan.get("zooms", [])
    
    # 1. Slice and Zoom A-Roll segments
    for idx, seg in enumerate(final_segments):
        v_out = f"v_trim{idx}"
        a_out = f"a_trim{idx}"
        
        # Calculate active zoom scale
        scale_val = 1.0
        for z in zooms:
            if z["timestamp"] <= seg["start"]:
                scale_val = z.get("scale", 1.0)
                
        # Trim audio
        filter_complex.append(f"[0:a]atrim=start={seg['start']:.3f}:end={seg['end']:.3f},asetpts=PTS-STARTPTS[{a_out}]")
        audio_outputs.append(f"[{a_out}]")
        
        # Trim video and apply center zoom if needed
        if scale_val > 1.0:
            # Scale video up, then crop center back to 1080x1920 aspect standard
            zoom_filter = f"[0:v]trim=start={seg['start']:.3f}:end={seg['end']:.3f},setpts=PTS-STARTPTS,scale=iw*{scale_val}:-1,crop=iw/{scale_val}:ih/{scale_val}[{v_out}]"
        else:
            zoom_filter = f"[0:v]trim=start={seg['start']:.3f}:end={seg['end']:.3f},setpts=PTS-STARTPTS[{v_out}]"
            
        filter_complex.append(zoom_filter)
        video_outputs.append(f"[{v_out}]")

    # 2. Concat A-Roll cuts
    num_segs = len(final_segments)
    filter_complex.append(f"{''.join(video_outputs)}concat=n={num_segs}:v=1:a=0[v_concat]")
    filter_complex.append(f"{''.join(audio_outputs)}concat=n={num_segs}:v=0:a=1[a_concat]")
    
    current_video_label = "[v_concat]"
    
    # 3. Apply B-roll overlays on the concatenated video timeline
    timeline_time = 0.0
    brolls = edit_plan.get("brolls", [])
    
    for b_idx, seg in enumerate(final_segments):
        duration = seg["end"] - seg["start"]
        
        # Check if B-roll falls inside this segment's timestamps
        for b in brolls:
            b_start, b_end, b_query = b["start"], b["end"], b["query"]
            if b_start >= seg["start"] and b_start < seg["end"] and b_query in broll_map:
                in_idx = broll_map[b_query]
                # Map global timestamps to concatenated timeline position
                rel_start = timeline_time + (b_start - seg["start"])
                rel_end = rel_start + min(b_end - b_start, seg["end"] - b_start)
                
                v_overlay_out = f"v_overlay{b_idx}"
                # Scale stock video input to match portrait format (1080x1920) before overlay
                filter_complex.append(f"[{in_idx}:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920[scaled_broll{b_idx}]")
                filter_complex.append(f"{current_video_label}[scaled_broll{b_idx}]overlay=enable='between(t,{rel_start:.3f},{rel_end:.3f})':shortest=1[{v_overlay_out}]")
                current_video_label = f"[{v_overlay_out}]"
                
        timeline_time += duration

    # 4. Burn in Advanced ASS Captions
    # Escape path characters for FFmpeg filter parameter compatibility
    escaped_ass = ass_path.replace("\\", "/").replace(":", "\\:")
    filter_complex.append(f"{current_video_label}subtitles='{escaped_ass}'[v_final]")

    # Build final FFmpeg arguments
    # Enforces 1080x1920 target vertical stream profile
    cmd = [
        "ffmpeg",
        *inputs,
        "-filter_complex", ";".join(filter_complex),
        "-map", "[v_final]",
        "-map", "[a_concat]",
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "22",
        "-c:a", "aac",
        "-b:a", "192k",
        "-y",
        output_mp4_path
    ]
    
    try:
        print("[+] Rendering output file...")
        # Execute render process
        process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, universal_newlines=True)
        # Parse logs for progress feedback
        for line in process.stdout:
            if "frame=" in line or "time=" in line:
                sys.stdout.write(f"\r    {line.strip()}")
                sys.stdout.flush()
        process.wait()
        print("\n")
        
        if process.returncode == 0:
            print(f"[+] Render complete: {output_mp4_path}")
            return True
        else:
            print(f"[-] FFmpeg render failed. Return code: {process.returncode}")
            return False
    except Exception as e:
        print(f"[-] Error during headless render: {e}")
        return False
