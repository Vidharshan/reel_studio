import os
import json
import requests
from agent.config import FAL_KEY, TEMP_DIR

def transcribe_local(audio_path, model_size="base"):
    """
    Transcribes audio using local faster-whisper.
    Automatically falls back to CPU if CUDA libraries fail to load.
    """
    print(f"[+] Starting local Whisper transcription ({model_size})...")
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        print("[-] faster-whisper not installed. Trying Cloud.")
        return None

    # First attempt: Auto-detect (typically tries CUDA first)
    try:
        model = WhisperModel(model_size, device="auto", compute_type="int8")
        return _run_whisper_model(model, audio_path)
    except Exception as e:
        print(f"[-] Local Whisper GPU/Auto run failed: {e}")
        # Second attempt: Force CPU
        try:
            print("    - Retrying local Whisper on CPU...")
            model = WhisperModel(model_size, device="cpu", compute_type="float32")
            return _run_whisper_model(model, audio_path)
        except Exception as e_cpu:
            print(f"[-] Local Whisper CPU run failed: {e_cpu}. Trying Cloud fallbacks.")
            return None

def _run_whisper_model(model, audio_path):
    segments, info = model.transcribe(audio_path, word_timestamps=True)
    words_list = []
    for segment in segments:
        for word in segment.words:
            words_list.append({
                "word": word.word.strip(),
                "start": round(word.start, 3),
                "end": round(word.end, 3),
                "probability": round(word.probability, 3)
            })
    return words_list

def transcribe_cloud_openai_compatible(audio_path, api_key, base_url, model_name="whisper-large-v3"):
    """
    Transcribes audio using OpenAI-compatible Whisper APIs (OpenAI, Groq).
    """
    from openai import OpenAI
    client = OpenAI(api_key=api_key, base_url=base_url)
    try:
        with open(audio_path, "rb") as f:
            transcription = client.audio.transcriptions.create(
                file=f,
                model=model_name,
                response_format="verbose_json"
            )
        
        words_list = []
        # Parse verbose_json response
        words = getattr(transcription, "words", [])
        if words:
            for w in words:
                words_list.append({
                    "word": w.get("word", "").strip(),
                    "start": round(w.get("start", 0.0), 3),
                    "end": round(w.get("end", 0.0), 3),
                    "probability": 1.0
                })
        else:
            # Fallback to segment-based splitting if word level isn't returned
            segments = getattr(transcription, "segments", [])
            for seg in segments:
                text = seg.get("text", "")
                start = seg.get("start", 0.0)
                end = seg.get("end", 0.0)
                words = text.strip().split()
                if words:
                    duration = (end - start) / len(words)
                    for idx, w in enumerate(words):
                        words_list.append({
                            "word": w,
                            "start": round(start + (idx * duration), 3),
                            "end": round(start + ((idx + 1) * duration), 3),
                            "probability": 1.0
                        })
        return words_list
    except Exception as e:
        print(f"[-] Cloud OpenAI-compatible transcription failed: {e}")
        return None

def transcribe_cloud_fal(audio_path):
    """
    Transcribes audio using fal.ai cloud service via the official fal-client SDK.
    """
    print("[+] Starting fal.ai Cloud transcription...")
    if not FAL_KEY:
        return None

    os.environ["FAL_KEY"] = FAL_KEY
    try:
        import fal_client
        print("    - Uploading audio to fal storage via fal-client...")
        file_url = fal_client.upload_file(audio_path)
        print("    - Running transcription model (fal-ai/whisper)...")
        result = fal_client.subscribe(
            "fal-ai/whisper",
            arguments={
                "audio_url": file_url,
                "task": "transcribe",
                "chunk_level_timestamps": True,
                "version": "3"
            }
        )
        
        words_list = []
        chunks = result.get("chunks", []) or result.get("prediction", {}).get("chunks", [])
        for chunk in chunks:
            text = chunk.get("text", "")
            timestamp = chunk.get("timestamp", [0, 0])
            start = timestamp[0] if timestamp and len(timestamp) > 0 else 0
            end = timestamp[1] if timestamp and len(timestamp) > 1 else 0
            
            words = text.strip().split()
            if len(words) > 0:
                duration = (end - start) / len(words)
                for idx, w in enumerate(words):
                    words_list.append({
                        "word": w,
                        "start": round(start + (idx * duration), 3),
                        "end": round(start + ((idx + 1) * duration), 3),
                        "probability": 1.0
                    })
        return words_list
    except Exception as e:
        print(f"[-] Cloud fal.ai transcription failed: {e}")
        return None

def transcribe_audio(audio_path, local_first=True):
    """
    Main entry point for transcription. Prioritizes local CPU/GPU,
    then cheap Groq/OpenAI APIs, and fal.ai as a final fallback.
    """
    if local_first:
        words = transcribe_local(audio_path)
        if words is not None:
            return words
            
    # Cloud Fallback 1: Groq (Often Free/Very Cheap)
    if os.getenv("GROQ_API_KEY"):
        print("[+] Falling back to Groq Cloud Whisper API...")
        words = transcribe_cloud_openai_compatible(
            audio_path=audio_path,
            api_key=os.getenv("GROQ_API_KEY"),
            base_url="https://api.groq.com/openai/v1",
            model_name="whisper-large-v3"
        )
        if words is not None:
            return words

    # Cloud Fallback 2: OpenAI
    if os.getenv("OPENAI_API_KEY"):
        print("[+] Falling back to OpenAI Cloud Whisper API...")
        words = transcribe_cloud_openai_compatible(
            audio_path=audio_path,
            api_key=os.getenv("OPENAI_API_KEY"),
            base_url="https://api.openai.com/v1",
            model_name="whisper-1"
        )
        if words is not None:
            return words

    # Cloud Fallback 3: fal.ai (Costly credits)
    if FAL_KEY:
        return transcribe_cloud_fal(audio_path)

    print("[-] No cloud transcription keys found (GROQ_API_KEY, OPENAI_API_KEY, FAL_KEY).")
    return None
