# Run Reel Studio Autonomous Editing Pipeline

Execute the main Python agent on any raw video input to run transcription, AI planning, and local rendering.

## Usage
```bash
python -m agent.main <path_to_input_video.mp4>
```

## Arguments
- `path_to_input_video.mp4`: Absolute or relative path to your raw input recording.

## Outputs
Compiled vertical video clips, transcripts, and FCPXML templates will be written to:
`d:\2026\reel_studio\agent_temp\job_<video_name>\`
