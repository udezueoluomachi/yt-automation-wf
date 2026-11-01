#!/usr/bin/env bash
set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

# Ensure Node & AGY binaries are on PATH even in non-interactive / systemd / cron shells
export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

# Load environment variables from .env
if [ -f "$PROJECT_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$PROJECT_DIR/.env"
  set +a
fi

NODE_BIN="$(command -v node || echo "$HOME/.nvm/versions/node/v24.21.0/bin/node")"
AGY_BIN="${AGY_BIN_PATH:-$(command -v agy || echo "$HOME/.local/bin/agy")}"
CONVERSATION_ID="${AGY_CONVERSATION_ID:-$1}"
LOG_FILE="$PROJECT_DIR/cron.log"
MAX_RETRIES=3
RETRY_DELAY=180 # 3 minutes

# -----------------------------------------------------------------------------
# 1. EARLY CHECK: Is any task actually due?
# Check calendar BEFORE touching network, Chrome, or any service.
# -----------------------------------------------------------------------------
NODE_CHECK=$("$NODE_BIN" -e "
  const fs = require('fs');
  const cal = JSON.parse(fs.readFileSync('data/calendar.json', 'utf8'));
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const timeStr = now.toTimeString().slice(0, 5);
  // Find any pending task from today or earlier that is due
  const due = cal.find(t => t.status === 'PENDING' && (t.scheduledDate < dateStr || (t.scheduledDate === dateStr && (t.scheduledTime || '00:00') <= timeStr)));
  if (due) console.log(due.serialId);
" 2>/dev/null || true)

if [ -z "$NODE_CHECK" ]; then
  # No task is due: exit immediately without touching Chrome or starting any process
  exit 0
fi

echo "==================================================" >> "$LOG_FILE"
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting production run for due task: $NODE_CHECK" >> "$LOG_FILE"

if [ -z "$CONVERSATION_ID" ]; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: AGY_CONVERSATION_ID not set in .env. Exiting." >> "$LOG_FILE"
  exit 1
fi

# -----------------------------------------------------------------------------
# CLEANUP TRAP: Cleanly terminate automation Chrome and Kimi when done
# -----------------------------------------------------------------------------
cleanup() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Cleaning up temporary automation processes..." >> "$LOG_FILE"
  pkill -f "remote-debugging-port=9333" >/dev/null 2>&1 || true
}
trap cleanup EXIT

# -----------------------------------------------------------------------------
# 2. Wait for internet connection (up to 60s)
# -----------------------------------------------------------------------------
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

# -----------------------------------------------------------------------------
# 3. Check & auto-launch Kimi WebBridge if down
# -----------------------------------------------------------------------------
if ! curl -s http://127.0.0.1:10086/health >/dev/null 2>&1 && ! pgrep -f "kimi-webbridge" >/dev/null 2>&1; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Kimi WebBridge not running. Starting daemon..." >> "$LOG_FILE"
  nohup /home/oluomachi-c-udezue/.kimi-webbridge/bin/kimi-webbridge run --addr 127.0.0.1:10086 >> "$PROJECT_DIR/kimi.log" 2>&1 &
  sleep 4
fi

# -----------------------------------------------------------------------------
# 4. Launch isolated headless Chrome ONLY for this production run
# Uses strictly its own user-data-dir and NEVER touches the user's regular Chrome profile.
# Completely unsets DISPLAY and WAYLAND so it NEVER opens a GUI window on the screen.
# -----------------------------------------------------------------------------
if ! curl -s http://127.0.0.1:9333/json/version >/dev/null 2>&1; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting isolated headless Chrome on port 9333..." >> "$LOG_FILE"
  rm -f "$HOME/.config/google-chrome-remote/Singleton"* 2>/dev/null || true
  
  CHROME_FLAGS="--remote-debugging-port=9333 --user-data-dir=$HOME/.config/google-chrome-remote --headless=new --disable-gpu --no-first-run --no-default-browser-check"
  nohup env -u DISPLAY -u WAYLAND_DISPLAY -u XAUTHORITY google-chrome $CHROME_FLAGS https://flow.google.com/ >> "$PROJECT_DIR/chrome.log" 2>&1 &
  sleep 5
fi

# -----------------------------------------------------------------------------
# 5. Production execution loop with retries
# -----------------------------------------------------------------------------
ATTEMPT=1
SUCCESS=0

while [ $ATTEMPT -le $MAX_RETRIES ]; do
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Attempt $ATTEMPT of $MAX_RETRIES for $NODE_CHECK..." >> "$LOG_FILE"
  
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
