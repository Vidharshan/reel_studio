# Autonomous Video Editing Agent Workspace
**Pure Python Video Editing Agent & DaVinci Orchestrator**

This workspace contains the Python-native editing agent. It extracts video speech, programmatically removes silences, generates dynamic zooms/cuts using DeepSeek-R1, downloads relevant B-roll overlays, and compiles the final vertical reel. 

It supports two execution modes:
1. **Headless Cloud Mode (No Resolve Required)**: Runs entirely on your VPS or server using local **FFmpeg** to stitch video cuts, apply zooms, download stock footage, and burn in custom-styled typography.
2. **Desktop DaVinci Resolve Mode**: Connects to the running DaVinci Resolve application on your workstation and imports the FCPXML to generate a fully editable timeline.

---

## 1. Setup Instructions

### Prerequisites
1. **Python**: Python 3.9 - 3.11 is recommended.
2. **FFmpeg**: **Required** for both modes. Must be installed and added to your system's PATH.
3. **DaVinci Resolve (Optional)**: If you want to use Desktop Mode, DaVinci Resolve Studio is recommended for automatic Python imports. (If using the Free version, you can import the generated `.fcpxml` file manually).

### Installation
1. Navigate to the `agent` folder and install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
   *Note: If you plan to run transcription locally using GPU, install the CUDA-supported version of PyTorch.*

2. Set up your environment variables. Edit the `.env.local` in the project root directory:
   ```env
   FAL_KEY="your-fal-api-key"
   DEEPSEEK_API_KEY="your-deepseek-api-key"
   PEXELS_API_KEY="your-pexels-api-key"
   ```

3. Configure DaVinci Resolve Scripting API:
   - Open DaVinci Resolve.
   - Go to **Preferences (Ctrl + ,)** -> **System** -> **Control Panels**.
   - Under **Scripting**, set **External scripting** to **Local**.
   - Restart DaVinci Resolve.

---

## 2. Running the Agent

To run the full autonomous pipeline on a raw talking-head recording:

```bash
python agent/main.py D:/videos/my_raw_footage.mp4
```

### What happens under the hood:
1. **Audio Extraction**: FFmpeg extracts the audio track into a temporary WAV file.
2. **Transcription**: The audio is transcribed with word-level timestamps (tries local `faster-whisper` model first, falls back to `fal-ai/whisper` cloud API if CUDA is missing).
3. **Silence Cut-point Detection**: A local python algorithm calculates exact silent zones between words and trims them to create a tight, snappy jump-cut flow.
4. **DeepSeek-R1 Editorial Planning**: The transcription is analyzed by DeepSeek-R1 to plan dynamic zooms, request contextual B-rolls, group subtitle text, and place transition sound effects.
5. **Stock B-roll Fetching**: Queries Pexels for vertical footage matches and downloads them.
6. **XML Compilation**: Compiles a standard Apple FCPXML timeline linking A-roll cuts, zooms, and B-roll overlays.
7. **DaVinci Import**: Connects to the open DaVinci Resolve app and imports the FCPXML, building your timeline automatically.
