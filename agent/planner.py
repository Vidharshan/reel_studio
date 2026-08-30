import os
import json
from openai import OpenAI
from agent.config import DEEPSEEK_API_KEY, OPENROUTER_API_KEY

def get_llm_client():
    """
    Returns an OpenAI-compatible client configured for DeepSeek or OpenRouter.
    """
    if DEEPSEEK_API_KEY:
        return OpenAI(api_key=DEEPSEEK_API_KEY, base_url="https://api.deepseek.com/v1")
    elif OPENROUTER_API_KEY:
        return OpenAI(api_key=OPENROUTER_API_KEY, base_url="https://openrouter.ai/api/v1")
    else:
        # Fallback to local Ollama if available
        print("[*] No cloud LLM keys found. Falling back to local Ollama (localhost:11434)...")
        return OpenAI(api_key="ollama", base_url="http://localhost:11434/v1")

def detect_silence_gaps(words, total_duration, max_gap=0.35):
    """
    Programmatically detects silent intervals between words.
    Returns a list of active timeline segments: [{'start': s, 'end': e}]
    If no words are detected, returns the entire video length as a single active segment.
    """
    if not words:
        return [{"start": 0.0, "end": total_duration}]

    segments = []
    current_start = words[0]["start"]
    
    for i in range(len(words) - 1):
        gap = words[i+1]["start"] - words[i]["end"]
        if gap > max_gap:
            segments.append({
                "start": current_start,
                "end": words[i]["end"]
            })
            current_start = words[i+1]["start"]
            
    segments.append({
        "start": current_start,
        "end": words[-1]["end"]
    })
    return segments

def plan_creative_elements(words, active_segments):
    """
    Sends the transcript and active segments to DeepSeek-R1.
    Asks the model to filter bad takes, design zoom points, B-rolls, and sound design.
    """
    print("[+] Planning creative layout with DeepSeek-R1...")
    
    client = get_llm_client()
    model_name = "deepseek-reasoner" if DEEPSEEK_API_KEY else "deepseek/deepseek-r1"
    if not DEEPSEEK_API_KEY and not OPENROUTER_API_KEY:
        model_name = "llama3" # local Ollama model default

    transcript_summary = []
    for idx, w in enumerate(words):
        transcript_summary.append({
            "idx": idx,
            "word": w["word"],
            "start": w["start"],
            "end": w["end"]
        })

    prompt = f"""You are a professional vertical video editor (TikTok/Reel specialist).
We have a raw talking-head A-roll video. The speech has been transcribed with word-level timestamps:
{json.dumps(transcript_summary)}

These are the frame-accurate active audio segments we detected (silences are cut out):
{json.dumps(active_segments)}

Your goal is to output a creative editing plan JSON to transform this footage into a highly engaging, viral 9:16 short.

Tasks:
1. "removals": Detect stutters, repeated sentences, or double takes. If a speaker repeats a line, flag the index range of the BAD take in "removals" so we can slice it out.
2. "zooms": Plan dynamic camera zooms (punch-in scale 1.15x, punch-out scale 1.0x). Toggle zooms every 3-4 seconds, or on major punchlines/keywords to create visual rhythm.
3. "brolls": Suggest 2-3 B-roll segments. Identify parts of the script that can be replaced with visual clips (e.g. coffee brewing, typing on laptop, graph trending up). Provide Pexels/Pixabay keywords in "query" and duration start/end timestamps.
4. "captions": Plan word groupings (2-4 words per caption screen). Suggest formatting: highlight important words (set color: "yellow" or "cyan") and assign contextually relevant emojis.
5. "sfx": Place sound effects (e.g. "whoosh" for B-roll cuts and zoom cuts, "pop" or "bell" for caption emojis). Specify the exact timestamp to play them.

Format your output STRICTLY as a raw JSON object. Do not wrap in ```json or markdown tags.
JSON format:
{{
  "removals": [
    {{"start": 12.3, "end": 15.6, "reason": "repeated take"}}
  ],
  "zooms": [
    {{"timestamp": 0.0, "scale": 1.0}},
    {{"timestamp": 3.2, "scale": 1.15}},
    {{"timestamp": 6.5, "scale": 1.0}}
  ],
  "brolls": [
    {{"start": 2.4, "end": 5.1, "query": "coffee pouring", "type": "video"}}
  ],
  "captions": [
    {{"start": 0.0, "end": 1.5, "text": "This simple hack", "color_words": ["hack"], "emoji": "💡"}},
    {{"start": 1.5, "end": 3.0, "text": "saves me hours", "color_words": ["saves", "hours"], "emoji": "⏳"}}
  ],
  "sfx": [
    {{"timestamp": 0.0, "effect": "pop"}},
    {{"timestamp": 2.4, "effect": "whoosh"}},
    {{"timestamp": 3.2, "effect": "whoosh"}}
  ]
}}
Do not write explanations, return the raw JSON object only.
"""

    try:
        response = client.chat.completions.create(
            model=model_name,
            messages=[
                {"role": "system", "content": "You are a professional video editor that outputs JSON only."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.2,
        )
        
        raw_content = response.choices[0].message.content.strip()
        # Clean potential markdown wrapping
        cleaned = raw_content.replace("```json", "").replace("```", "").strip()
        
        plan = json.loads(cleaned)
        print("[+] DeepSeek edit plan successfully generated.")
        return plan
    except Exception as e:
        print(f"[-] DeepSeek planning failed: {e}. Falling back to default plan.")
        # Return sensible fallback plan
        return {
            "removals": [],
            "zooms": [{"timestamp": 0.0, "scale": 1.0}],
            "brolls": [],
            "captions": [],
            "sfx": []
        }
