# Autonomous YouTube Shorts Production Engine (`yt-automation-wf`)

## 1. Mission & Operational Architecture
This project runs an autonomous production engine powered by **Antigravity CLI (`agy`)**. It schedules, generates, edits, reviews, and dispatches high-retention 9:16 vertical YouTube Shorts (15–20 seconds) based on a structured content calendar (`data/calendar.json`).

All autonomous executions reuse a single persistent conversation context (`--conversation $AGY_CONVERSATION_ID` defined in `.env`) so the agent preserves complete memory, feedback, and execution history.

```mermaid
flowchart TD
    Cron["System Cron / Trigger\n(08:00, 13:00, 18:00)"] -->|Invokes agy with single conversation ID| AGY["Antigravity CLI\n(agy --conversation <id> --dangerously-skip-permissions)"]
    AGY -->|1. Reads Schedule| Cal["data/calendar.json\n(60 Scheduled Shorts)"]
    AGY -->|2. Directs Google Flow via Kimi| Flow["Google Flow (3D CGI Models Veo 9:16)"]
    AGY -->|3. Generates Voiceover via Kimi| AIStudio["Google AI Studio (Ludo 3.8 Flash TTS)"]
    AGY -->|4. Compiles Clean 9:16 Video| Remotion["Remotion Engine\n(Clean Kinetic Text, No UI Clutter)"]
    AGY -->|5. Dispatches Review Email| Mail["src/mailer.ts\n(SMTP Review with Video Attachment)"]
    AGY -->|6. Updates State| CalDone["Mark status: DONE in calendar.json"]
```

---

## 2. Creative & Directorial Standards

### 🚫 Strict 3D Model Policy (Zero Real Humans)
- **Never depict or prompt real humans, live-action footage, or photos of real people.**
- **All subjects must be stylized 3D models:** 3D anatomical models, digital mannequins, Blender/Octane CGI characters, mechanical 3D cross-sections.
- Prompts must always include: `stylized 3D CGI model, digital mannequin, Octane 3D anatomical render` and negative prompt `real human, photo, live-action`.

### 🎙️ Audio Voiceover (Google AI Studio via Kimi WebBridge)
- **Standard Voice:** **`Ludo`** (Gemini 3.8 Flash TTS in Google AI Studio).
- **Tone Profile:** Confident, clear, articulate, low-pitch male voice modeled on the curiosity-driven, fast-paced cadence of *Zack D. Films* without copyright/infringement flags.
- **Workflow:**
  1. Navigate to `https://aistudio.google.com/generate-speech?model=gemini-3.8-flash-tts` using Kimi WebBridge.
  2. Select speaker voice **`Ludo`** (`Open voice settings` -> click `Ludo` under Instructional).
  3. Enter full script into `Speech block text`, click `Run Ctrl`, and click `Download`.
  4. Audio moves to `~/Downloads/Generated Audio*.wav`.
  5. Convert to `public/audio/[serialId].mp3` via ffmpeg (`-ar 48000 -ac 2 -b:a 192k`).

### ⚡ Pacing & Cut Dynamics
- **Total Duration:** 15–20 seconds total (~5.0s to 5.5s per act). Never pad videos with dead air or awkward pauses.
- **Dynamic Scale Punch on Cut:** Each clip entrance performs an energetic camera scale punch (`scale(1.06) -> scale(1.0)` over 9 frames) to maintain viewer engagement.
- **Seamless Edge Dissolve:** 4-frame crossfade at clip boundaries eliminates jarring cut jumps.
- **Kinetic Word Highlighting:** Subtitles highlight word-by-word at a ~0.33s cadence, locking in 1:1 with Ludo's enunciation.

### 🚫 Zero UI Clutter in Remotion
- **No progress bars** or top timers.
- **No act/clip indicators** ("Act 1 / 3").
- **No narration label headers** ("🎙️ NARRATION").
- **No dark background boxes/containers behind captions.**
- Captions must float directly over the 3D video as raw, bold kinetic typography (`#FFE600` active word highlights, `#FFFFFF` text with solid black drop shadow/stroke).

### 📦 Complete Production Package Email Dispatch
- **Always attach all raw & edited assets for independent editing:**
  1. `[serialId]_Final_Render.mp4`: Complete compiled short with kinetic captions and voiceover.
  2. `[serialId]_Voiceover.mp3`: Clean voiceover track (Ludo, Google AI Studio TTS).
  3. `[serialId]_Raw_Clip_01.mp4`, `02.mp4`, etc.: Individual 3D CGI clips (Google Flow).
  4. `[serialId]_Edit_Manifest.txt`: Plain text document containing act-by-act narration lines, visual prompts, SFX cues, and mobile editing tips (CapCut / VN).
- **Auto-fallback on size limits:** If the combined size exceeds SMTP provider limits, automatically dispatch in two parts (Part 1: Render & Audio, Part 2: Raw Clips).
- **Mobile First:** Assets are cleanly labeled so the user can import directly into phone video editors when away from their desk.

### 🔒 Git Hygiene (Zero Media in Git)
- Media files (`.mp4`, `.mp3`, `.wav`, `.mov`) must **never** be committed to Git.
- `public/audio/`, `public/clips/`, and `out/` are strictly ignored in `.gitignore`.

---

## 3. Autonomous Antigravity CLI Execution

### Headless Production Command
```bash
agy --conversation $(grep AGY_CONVERSATION_ID .env | cut -d '=' -f2) \
  -p "Produce the scheduled YouTube Short for the current time slot. Generate 3D model clips via Google Flow, voiceover via Google AI Studio, assemble clean kinetic video in Remotion, dispatch review email, and mark as DONE." \
  --dangerously-skip-permissions
```

### Scheduled Cron & Systemd Automation (08:00, 13:00, 18:00)
Runs through the resilient runner script with automatic Wi-Fi retry, Chrome auto-launch, and persistent sleep wake-up catchup:
```bash
# Handled automatically via scripts/run-production-job.sh
0 8,13,18 * * * /home/oluomachi-c-udezue/projects/yt-automation-wf/scripts/run-production-job.sh >> /home/oluomachi-c-udezue/projects/yt-automation-wf/cron.log 2>&1
```

---

## 4. Quality Gates & Validation
- **Typecheck:** `npm run typecheck` (`tsc --noEmit`)
- **Unit Tests:** `npm test` (`vitest run`)
- **Calendar Update:** `npm run update-calendar`
