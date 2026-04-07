# Local Recorder Agent (Windows)

This agent joins active LiveKit rooms and stores one `.wav` file per participant audio track.

## What it does

- Polls LiveKit for active rooms
- Joins each room as a hidden recorder participant
- Subscribes to remote microphone audio tracks
- Writes PCM audio as `.wav` files
- File output path: `controller/tools/recordings/<room-name>/`

## Requirements

- Node.js 20+ (you already have Node 22)
- Running LiveKit server (local default: `http://127.0.0.1:7880`)
- LiveKit API key/secret (local defaults in this repo: `devkey` / `secret`)

## Run

From the `controller` directory:

```bat
tools\run_local_recorder_agent.cmd
```

The first run installs dependencies automatically.

## Output

Recorded files are saved to:

```text
controller\tools\recordings\<room-name>\<participant>_<track>_<timestamp>.wav
```

## Notes

- This records participant audio tracks individually, not a single mixed meeting file.
- If a participant republishes audio (new track id), a new `.wav` file is created.
