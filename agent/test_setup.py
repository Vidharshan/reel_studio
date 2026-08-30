import os
import sys
import subprocess
from agent.config import FAL_KEY, DEEPSEEK_API_KEY, PEXELS_API_KEY, env_path

def test_imports():
    print("[1/4] Verifying library dependencies...")
    libs = ["openai", "pydub", "requests", "dotenv"]
    all_ok = True
    for lib in libs:
        try:
            __import__(lib)
            print(f"  [+] {lib} imported successfully.")
        except ImportError:
            print(f"  [-] Failed to import {lib}")
            all_ok = False
            
    # faster-whisper import test (warns if GPU/CUDA drivers are not present but passes)
    try:
        import faster_whisper
        print("  [+] faster-whisper imported successfully.")
    except ImportError:
        print("  [-] faster-whisper not installed (Cloud transcription will still work).")
        
    return all_ok

def test_env_keys():
    print("\n[2/4] Verifying API configuration keys...")
    print(f"  Looking in env file: {env_path}")
    
    if not FAL_KEY:
        print("  [-] FAL_KEY is missing. Add it to .env.local for Cloud services.")
    else:
        print("  [+] FAL_KEY loaded successfully.")
        
    if not DEEPSEEK_API_KEY:
        print("  [-] DEEPSEEK_API_KEY is missing. Add it to .env.local for AI cuts & zooming.")
    else:
        print("  [+] DEEPSEEK_API_KEY loaded successfully.")
        
    if not PEXELS_API_KEY:
        print("  [*] PEXELS_API_KEY is missing (optional). Stock B-rolls will be skipped.")
    else:
        print("  [+] PEXELS_API_KEY loaded successfully.")

def check_ffmpeg():
    print("\n[3/4] Checking FFmpeg installation...")
    try:
        subprocess.run(["ffmpeg", "-version"], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        print("  [+] FFmpeg is installed and accessible on system PATH.")
        return True
    except Exception:
        print("  [-] FFmpeg not found. Ensure FFmpeg is installed and added to your system PATH.")
        return False

def generate_dummy_video(output_path):
    print(f"\n[4/4] Creating a 5-second vertical test video: {output_path}")
    # Generates a vertical test-pattern video (1080x1920) at 30fps with a 1kHz sine wave beep
    cmd = [
        "ffmpeg",
        "-f", "lavfi", "-i", "testsrc=duration=5:size=1080x1920:rate=30",
        "-f", "lavfi", "-i", "sine=frequency=1000:duration=5",
        "-c:v", "libx264",
        "-c:a", "aac",
        "-pix_fmt", "yuv420p",
        "-y",
        output_path
    ]
    try:
        subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        print(f"  [+] Dummy video generated successfully at: {output_path}")
        return True
    except Exception as e:
        print(f"  [-] Failed to generate dummy video: {e}")
        return False

if __name__ == "__main__":
    print("="*50)
    print("      REEL STUDIO PIPELINE DIAGNOSTICS")
    print("="*50)
    
    test_imports()
    test_env_keys()
    has_ffmpeg = check_ffmpeg()
    
    dummy_video_path = os.path.join(os.path.dirname(__file__), "dummy_test.mp4")
    if has_ffmpeg:
        generate_dummy_video(dummy_video_path)
        
    print("\n" + "="*50)
    print("Onboarding Diagnostic complete!")
    if has_ffmpeg and os.path.exists(dummy_video_path):
        print(f"To run a pipeline test, run:")
        print(f"  python agent/main.py agent/dummy_test.mp4")
    print("="*50)
