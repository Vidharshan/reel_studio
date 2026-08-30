import os
import sys
import requests
from agent.config import RESOLVE_PATHS, TEMP_DIR

def download_pexels_broll(query, output_dir, limit=1):
    """
    Queries the Pexels API for vertical video clips matching the query.
    Saves the first matching video locally.
    """
    api_key = os.getenv("PEXELS_API_KEY")
    if not api_key:
        print(f"[*] No PEXELS_API_KEY found. Skipping stock B-roll download for query: '{query}'")
        return None

    print(f"[+] Searching Pexels for stock footage: '{query}'...")
    url = f"https://api.pexels.com/videos/search?query={query}&per_page={limit}&orientation=portrait"
    headers = {"Authorization": api_key}
    
    try:
        r = requests.get(url, headers=headers)
        if r.status_code != 200:
            print(f"[-] Pexels search failed: {r.text}")
            return None
            
        data = r.json()
        videos = data.get("videos", [])
        if not videos:
            print("[-] No matching B-roll found on Pexels.")
            return None
            
        # Get the highest quality mobile/SD vertical video link
        video_files = videos[0].get("video_files", [])
        # Find a good file link
        download_url = None
        for vf in video_files:
            if vf.get("width") and vf.get("width") <= 1080:
                download_url = vf.get("link")
                break
                
        if not download_url and video_files:
            download_url = video_files[0].get("link")
            
        if not download_url:
            return None
            
        output_path = os.path.join(output_dir, f"broll_{query.replace(' ', '_')}.mp4")
        print(f"    - Downloading stock clip to {output_path}...")
        
        # Download stream
        v_data = requests.get(download_url, stream=True)
        with open(output_path, "wb") as f:
            for chunk in v_data.iter_content(chunk_size=1024*1024):
                if chunk:
                    f.write(chunk)
                    
        print(f"[+] B-roll download complete: {output_path}")
        return output_path
    except Exception as e:
        print(f"[-] B-roll download error: {e}")
        return None

def generate_fcpxml(a_roll_path, active_segments, edit_plan, broll_paths, output_xml_path):
    """
    Compiles cuts, zooms, B-rolls, and audio tracks into a standard FCPXML.
    """
    print("[+] Generating FCPXML file...")
    
    # 1. Resolve absolute paths to URLs
    a_roll_url = f"file:///{os.path.abspath(a_roll_path).replace(os.sep, '/')}"
    
    # 2. Build Resource XML blocks
    resources = [
        '<format id="r1" name="FFVideoFormat1080p2997" frameDuration="1001/30000s"/>',
        f'<asset id="a-roll" name="a_roll" src="{a_roll_url}" duration="3600s" hasVideo="1" hasAudio="1"/>'
    ]
    
    broll_assets = {}
    for idx, (query, path) in enumerate(broll_paths.items()):
        broll_id = f"b-roll-{idx}"
        broll_url = f"file:///{os.path.abspath(path).replace(os.sep, '/')}"
        resources.append(f'<asset id="{broll_id}" name="broll_{idx}" src="{broll_url}" duration="600s" hasVideo="1"/>')
        broll_assets[query] = broll_id

    # 3. Process cuts and removals
    # We slice A-roll based on active_segments, filtering out ranges listed in edit_plan['removals']
    removals = edit_plan.get("removals", [])
    
    final_segments = []
    for seg in active_segments:
        seg_start = seg["start"]
        seg_end = seg["end"]
        
        # Check if this segment intersects with any LLM removals
        keep = True
        for rem in removals:
            if rem["start"] <= seg_start and rem["end"] >= seg_end:
                keep = False
                break
            elif rem["start"] > seg_start and rem["start"] < seg_end:
                # Truncate end
                seg_end = rem["start"]
            elif rem["end"] > seg_start and rem["end"] < seg_end:
                # Truncate start
                seg_start = rem["end"]
                
        if keep and (seg_end - seg_start) > 0.1:
            final_segments.append({"start": seg_start, "end": seg_end})

    # 4. Build Sequence Spine Clips
    spine_clips = []
    timeline_time = 0.0 # Running timeline playhead offset in seconds
    
    # Zoom config mapping
    zooms = edit_plan.get("zooms", [])
    
    # B-roll overlay mapping
    brolls = edit_plan.get("brolls", [])

    for idx, seg in enumerate(final_segments):
        duration = seg["end"] - seg["start"]
        
        # Check zoom scale for this timestamp
        scale_val = 1.0
        for z in zooms:
            if z["timestamp"] <= seg["start"]:
                scale_val = z.get("scale", 1.0)
                
        # Transform XML block if zoomed
        transform = ""
        if scale_val > 1.0:
            transform = f'<adjust-transform scale="{scale_val} {scale_val}" position="0 0"/>'
            
        clip_name = f"A-Roll Segment {idx+1}"
        
        # Look for B-roll overlays intersecting this segment
        overlays_xml = []
        for b in brolls:
            b_start = b["start"]
            b_end = b["end"]
            b_query = b["query"]
            
            # If B-roll overlaps current segment
            if b_start >= seg["start"] and b_start < seg["end"] and b_query in broll_assets:
                b_id = broll_assets[b_query]
                b_offset = b_start - seg["start"] # Relative offset inside this spine clip
                b_dur = min(b_end - b_start, seg["end"] - b_start)
                
                overlays_xml.append(
                    f'<asset-clip ref="{b_id}" lane="1" offset="{b_offset:.3f}s" name="B-Roll Overlay" start="0s" duration="{b_dur:.3f}s"/>'
                )
                
        overlays_str = "\n".join(overlays_xml)
        
        spine_clips.append(f"""
        <asset-clip ref="a-roll" offset="{timeline_time:.3f}s" name="{clip_name}" start="{seg['start']:.3f}s" duration="{duration:.3f}s">
            {transform}
            {overlays_str}
        </asset-clip>
        """)
        timeline_time += duration

    # 5. Build full XML string
    resources_str = "\n    ".join(resources)
    spine_str = "\n".join(spine_clips)
    
    fcpxml_content = f"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE fcpxml SYSTEM "fcpxml.dtd">
<fcpxml version="1.9">
    <resources>
        {resources_str}
    </resources>
    <library>
        <event name="Automated Agent Event">
            <project name="AI_Generated_Reel">
                <sequence duration="{timeline_time:.3f}s" format="r1" tcStart="0s">
                    <spine>
                        {spine_str}
                    </spine>
                </sequence>
            </project>
        </event>
    </library>
</fcpxml>
"""
    with open(output_xml_path, "w", encoding="utf-8") as f:
        f.write(fcpxml_content)
        
    print(f"[+] FCPXML compiled successfully: {output_xml_path}")
    return output_xml_path

def import_to_davinci(fcpxml_path):
    """
    Connects to DaVinci Resolve scripting APIs to automatically build the timeline.
    """
    print("[+] Connecting to DaVinci Resolve script interface...")
    
    # Auto-load windows/mac path to PYTHONPATH to ensure clean execution
    sys_platform = sys.platform
    resolve_api_dir = None
    
    if sys_platform.startswith("win"):
        resolve_api_dir = RESOLVE_PATHS["windows"]["modules"]
        # Ensure DLL path is set in env
        os.environ["RESOLVE_SCRIPT_LIB"] = RESOLVE_PATHS["windows"]["lib"]
    elif sys_platform.startswith("dar"): # mac
        resolve_api_dir = RESOLVE_PATHS["mac"]["modules"]
        os.environ["RESOLVE_SCRIPT_LIB"] = RESOLVE_PATHS["mac"]["lib"]

    if resolve_api_dir and resolve_api_dir not in sys.path:
        sys.path.append(resolve_api_dir)

    try:
        import DaVinciResolveScript as dvr_script
        resolve = dvr_script.GetResolve()
    except ImportError:
        print("[-] DaVinci API modules not found. Ensure PYTHONPATH includes the Resolve developer folders.")
        print("[*] FALLBACK: Import the generated XML file manually inside DaVinci Resolve: File -> Import -> Timeline...")
        return False

    if not resolve:
        print("[-] DaVinci Resolve app is not running. Resolve must be open.")
        print("[*] FALLBACK: Import the generated XML file manually inside DaVinci Resolve: File -> Import -> Timeline...")
        return False
        
    try:
        pm = resolve.GetProjectManager()
        project = pm.GetCurrentProject()
        if not project:
            project = pm.CreateProject("AI_Reel_Session")
            
        # Set project vertical resolution standard (1080x1920)
        project.SetSetting("timelineResolutionWidth", "1080")
        project.SetSetting("timelineResolutionHeight", "1920")
        
        mediapool = project.GetMediaPool()
        print(f"[+] Programmatically importing FCPXML into DaVinci: {fcpxml_path}")
        timeline = mediapool.ImportTimelineFromFile(fcpxml_path)
        
        if timeline:
            print("[+] DaVinci Resolve Timeline created successfully!")
            return True
        else:
            print("[-] DaVinci Resolve XML import failed. Media file might be offline.")
            return False
    except Exception as e:
        print(f"[-] Error calling DaVinci Resolve API: {e}")
        print("[*] FALLBACK: Import the generated XML file manually inside DaVinci Resolve: File -> Import -> Timeline...")
        return False
