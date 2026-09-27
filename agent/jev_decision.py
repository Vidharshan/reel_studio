import os
import json
from openai import OpenAI
from agent.config import OPENROUTER_API_KEY, FAL_KEY

def get_jev_client():
    """
    Returns an OpenAI client instance targeting OpenRouter's API endpoint.
    """
    api_key = os.getenv("JEV_API_KEY") or OPENROUTER_API_KEY or FAL_KEY
    if OPENROUTER_API_KEY or os.getenv("JEV_API_KEY"):
        return OpenAI(api_key=api_key, base_url="https://openrouter.ai/api/v1")
    elif FAL_KEY:
        # Fallback via fal OpenRouter proxy
        return OpenAI(api_key=FAL_KEY, base_url="https://fal.run/openrouter/router/openai/v1")
    return None

def classify_footage_jev(files_summary):
    """
    Jev Decision 1: Classifies upload as single_long_take, multi_clip_mix, or photo_only.
    """
    client = get_jev_client()
    if not client:
        return {"choice": "multi_clip_mix", "confidence": 0.5}

    prompt = f"Classify the following upload files into 'single_long_take', 'multi_clip_mix', or 'photo_only': {files_summary}. Output raw JSON: {{\"choice\": \"...\", \"confidence\": 0.95}}"
    try:
        response = client.chat.completions.create(
            model="typesafe/jev-1.13",
            messages=[
                {"role": "system", "content": "You are Jev, a typed decision model. Output raw JSON only."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.1
        )
        content = response.choices[0].message.content.strip().replace("```json", "").replace("```", "").strip()
        return json.loads(content)
    except Exception as e:
        print(f"[-] Jev footage classification error: {e}")
        return {"choice": "multi_clip_mix", "confidence": 0.5}

def score_filler_segment_jev(transcript, silence_ratio):
    """
    Jev Decision 5: Scores whether a detected segment is a filler word/stutter to cut.
    """
    client = get_jev_client()
    if not client:
        is_filler = bool(transcript and any(w in transcript.lower().split() for w in ["um", "uh", "like", "you know"]))
        return {"cutScore": 0.9 if is_filler else 0.1, "shouldCut": is_filler}

    prompt = f"Score segment: transcript='{transcript}', silence_ratio={silence_ratio}. Output raw JSON: {{\"cutScore\": 0.85, \"shouldCut\": true}}"
    try:
        response = client.chat.completions.create(
            model="typesafe/jev-1.13",
            messages=[
                {"role": "system", "content": "You are Jev, a typed decision model. Output raw JSON only."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.1
        )
        content = response.choices[0].message.content.strip().replace("```json", "").replace("```", "").strip()
        return json.loads(content)
    except Exception as e:
        print(f"[-] Jev filler scoring error: {e}")
        is_filler = bool(transcript and any(w in transcript.lower().split() for w in ["um", "uh", "like", "you know"]))
        return {"cutScore": 0.9 if is_filler else 0.1, "shouldCut": is_filler}

def select_broll_candidate_jev(scene_text, candidates):
    """
    Jev Decision 3: Selects the best matching b-roll candidate from Florence-2/Pexels results.
    """
    client = get_jev_client()
    if not client or not candidates:
        return candidates[0]["id"] if candidates else ""

    cand_str = json.dumps(candidates)
    prompt = f"Pick best B-roll candidate ID for scene '{scene_text}' from candidates: {cand_str}. Output raw JSON: {{\"selectedId\": \"...\", \"confidence\": 0.9}}"
    try:
        response = client.chat.completions.create(
            model="typesafe/jev-1.13",
            messages=[
                {"role": "system", "content": "You are Jev, a typed decision model. Output raw JSON only."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.1
        )
        content = response.choices[0].message.content.strip().replace("```json", "").replace("```", "").strip()
        parsed = json.loads(content)
        return parsed.get("selectedId", candidates[0]["id"])
    except Exception as e:
        print(f"[-] Jev b-roll candidate selection error: {e}")
        return candidates[0]["id"] if candidates else ""
