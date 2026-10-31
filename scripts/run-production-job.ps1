# ==============================================================================
# YouTube Shorts Production Engine - Windows PowerShell Runner
# Scheduled via Windows Task Scheduler or run manually
# ==============================================================================

$ErrorActionPreference = "Continue"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectDir = Split-Path -Parent $ScriptDir
$LogFile = Join-Path $ProjectDir "cron.log"
$MaxRetries = 3
$RetryDelaySec = 180

function Write-Log {
    param([string]$Message)
    $TimeStamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $Line = "[$TimeStamp] $Message"
    Write-Host $Line
    Add-Content -Path $LogFile -Value $Line -ErrorAction SilentlyContinue
}

Write-Log "=================================================="
Write-Log "Starting Windows production job trigger..."

Set-Location $ProjectDir

# Load .env file
$EnvFile = Join-Path $ProjectDir ".env"
if (Test-Path $EnvFile) {
    Get-Content $EnvFile | ForEach-Object {
        $line = $_.Trim()
        if ($line -and -not $line.StartsWith("#") -and $line.Contains("=")) {
            $parts = $line.Split("=", 2)
            [System.Environment]::SetEnvironmentVariable($parts[0].Trim(), $parts[1].Trim(), "Process")
        }
    }
}

$ConversationId = $env:AGY_CONVERSATION_ID
if (-not $ConversationId) {
    Write-Log "ERROR: AGY_CONVERSATION_ID is not configured in .env. Exiting."
    exit 1
}

$AgyBin = if ($env:AGY_BIN_PATH) { $env:AGY_BIN_PATH } else { "agy.cmd" }

# 1. Wait for network
Write-Log "Checking internet connectivity..."
$NetOk = $false
for ($i = 1; $i -le 12; $i++) {
    try {
        $test = Test-Connection -ComputerName "1.1.1.1" -Count 1 -Quiet -ErrorAction SilentlyContinue
        if ($test) {
            $NetOk = $true
            Write-Log "Internet connectivity confirmed."
            break
        }
    } catch {}
    Write-Log "Waiting for network connection (attempt $i/12)..."
    Start-Sleep -Seconds 5
}

if (-not $NetOk) {
    Write-Log "ERROR: Network offline after 60 seconds. Aborting run."
    exit 1
}

# 2. Check & start Kimi WebBridge if down
try {
    $resp = Invoke-WebRequest -Uri "http://127.0.0.1:10086/health" -TimeoutSec 2 -UseBasicParsing -ErrorAction Stop
} catch {
    Write-Log "Kimi WebBridge not responding. Launching daemon..."
    Start-Process -FilePath "kimi-webbridge.cmd" -ArgumentList "run --addr 127.0.0.1:10086" -WindowStyle Hidden
    Start-Sleep -Seconds 4
}

# 3. Check calendar for due task via node
$NodeCheckScript = @"
const fs = require('fs');
const cal = JSON.parse(fs.readFileSync('data/calendar.json', 'utf8'));
const now = new Date();
const dateStr = now.toISOString().split('T')[0];
const timeStr = now.toTimeString().slice(0, 5);
const due = cal.find(t => t.status === 'PENDING' && (t.scheduledDate < dateStr || (t.scheduledDate === dateStr && (t.scheduledTime || '00:00') <= timeStr)));
if (due) console.log(due.serialId);
"@

$DueSerial = node -e $NodeCheckScript
if (-not $DueSerial) {
    Write-Log "No pending task due at this time. Exiting cleanly."
    exit 0
}

Write-Log "Found due task: $DueSerial. Launching Antigravity CLI..."

# 4. Retry Loop
$Attempt = 1
$Success = $false

while ($Attempt -le $MaxRetries) {
    Write-Log "Attempt $Attempt of $MaxRetries..."
    
    $Prompt = "Produce YouTube Short $DueSerial. Generate 3D model clips via Google Flow, voiceover via Google AI Studio, assemble in Remotion, dispatch complete review package email, and mark as DONE."
    
    & $AgyBin --conversation $ConversationId -p $Prompt --dangerously-skip-permissions *>> $LogFile
    
    if ($LASTEXITCODE -eq 0) {
        Write-Log "Production job succeeded on attempt $Attempt."
        $Success = $true
        break
    } else {
        Write-Log "Attempt $Attempt failed with exit code $LASTEXITCODE."
        if ($Attempt -lt $MaxRetries) {
            Write-Log "Waiting $RetryDelaySec seconds before retry..."
            Start-Sleep -Seconds $RetryDelaySec
        }
    }
    $Attempt++
}

if (-not $Success) {
    Write-Log "All $MaxRetries attempts failed for task $DueSerial."
    exit 1
}
