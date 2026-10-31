#!/usr/bin/env bash
set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

# Load environment variables from .env
if [ -f "$PROJECT_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$PROJECT_DIR/.env"
  set +a
fi

AGY_BIN="${AGY_BIN_PATH:-$(command -v agy || echo "$HOME/.local/bin/agy")}"
CONVERSATION_ID="${AGY_CONVERSATION_ID:-$1}"
LOG_FILE="$PROJECT_DIR/cron.log"
MAX_RETRIES=3
RETRY_DELAY=180 # 3 minutes

echo "==================================================" >> "$LOG_FILE"
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting production job trigger..." >> "$LOG_FILE"

if [ -z "$CONVERSATION_ID" ]; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: AGY_CONVERSATION_ID not set in .env. Exiting." >> "$LOG_FILE"
  exit 1
fi

# 1. Wait for network if waking up
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Checking internet connectivity..." >> "$LOG_FILE"
NET_OK=0
for i in {1..12}; do
  if ping -c 1 8.8.8.8 >/dev/null 2>&1 || ping -c 1 1.1.1.1 >/dev/null 2>&1; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Internet connectivity confirmed." >> "$LOG_FILE"
    NET_OK=1
    break
  fi
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Waiting for network connection (attempt $i/12)..." >> "$LOG_FILE"
  sleep 5
done

if [ $NET_OK -eq 0 ]; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: Network offline after 60 seconds. Aborting run." >> "$LOG_FILE"
  exit 1
fi

# 2. Check & auto-launch Kimi WebBridge if down
if ! curl -s http://127.0.0.1:10086/health >/dev/null 2>&1 && ! pgrep -f "kimi-webbridge" >/dev/null 2>&1; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Kimi WebBridge not running. Starting daemon..." >> "$LOG_FILE"
  nohup /home/oluomachi-c-udezue/.kimi-webbridge/bin/kimi-webbridge run --addr 127.0.0.1:10086 >> "$PROJECT_DIR/kimi.log" 2>&1 &
  sleep 4
fi

# 3. Check & ensure Chrome is running
if ! pgrep -f "google-chrome" >/dev/null 2>&1; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Google Chrome not running. Launching Chrome..." >> "$LOG_FILE"
  export DISPLAY=:0
  export WAYLAND_DISPLAY=wayland-0
  export XDG_RUNTIME_DIR=/run/user/1000
  nohup google-chrome --remote-debugging-port=9333 >> "$PROJECT_DIR/chrome.log" 2>&1 &
  sleep 6
fi

# 4. Check calendar for any overdue or current task
NODE_CHECK=$(node -e "
  const fs = require('fs');
  const cal = JSON.parse(fs.readFileSync('data/calendar.json', 'utf8'));
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const timeStr = now.toTimeString().slice(0, 5);
  // Find any pending task from today or past that is due
  const due = cal.find(t => t.status === 'PENDING' && (t.scheduledDate < dateStr || (t.scheduledDate === dateStr && (t.scheduledTime || '00:00') <= timeStr)));
  if (due) console.log(due.serialId);
")

if [ -z "$NODE_CHECK" ]; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] No pending task due at this time. Exiting cleanly." >> "$LOG_FILE"
  exit 0
fi

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Found due task: $NODE_CHECK. Launching Antigravity CLI..." >> "$LOG_FILE"

# 5. Execution loop with retries
ATTEMPT=1
SUCCESS=0

while [ $ATTEMPT -le $MAX_RETRIES ]; do
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Attempt $ATTEMPT of $MAX_RETRIES..." >> "$LOG_FILE"
  
  if "$AGY_BIN" --conversation "$CONVERSATION_ID" \
      -p "Produce the scheduled YouTube Short for the current time slot. Generate 3D model clips via Google Flow, voiceover via Google AI Studio, assemble clean kinetic video in Remotion, dispatch review email, and mark as DONE." \
      --dangerously-skip-permissions >> "$LOG_FILE" 2>&1; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Production job succeeded on attempt $ATTEMPT." >> "$LOG_FILE"
    SUCCESS=1
    break
  else
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Attempt $ATTEMPT failed with exit code $?." >> "$LOG_FILE"
    if [ $ATTEMPT -lt $MAX_RETRIES ]; then
      echo "[$(date '+%Y-%m-%d %H:%M:%S')] Waiting $RETRY_DELAY seconds before retry..." >> "$LOG_FILE"
      sleep "$RETRY_DELAY"
    fi
  fi
  ATTEMPT=$((ATTEMPT + 1))
done

if [ $SUCCESS -eq 0 ]; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] All $MAX_RETRIES attempts failed for task $NODE_CHECK." >> "$LOG_FILE"
  exit 1
fi
