#!/usr/bin/env bash
# =============================================================================
# Daily Retrospective Aggregator — One-time setup script
# Run: bash setup.sh
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLIST_SRC="$SCRIPT_DIR/scheduler/com.user.daily-retro.plist"
PLIST_DST="$HOME/Library/LaunchAgents/com.user.daily-retro.plist"
CONFIG_DIR="$HOME/.config/daily_retro"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " Daily Retrospective Aggregator — Setup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo

# ---------------------------------------------------------------------------
# 1. Python version check
# ---------------------------------------------------------------------------
PYTHON=$(command -v python3 || command -v python || true)
if [[ -z "$PYTHON" ]]; then
    echo "❌ Python 3.10+ is required. Install via: brew install python"
    exit 1
fi
PY_VER=$("$PYTHON" -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
echo "✓ Python $PY_VER found at $PYTHON"

# ---------------------------------------------------------------------------
# 2. Install Python dependencies
# ---------------------------------------------------------------------------
echo
echo "Installing Python dependencies…"
"$PYTHON" -m pip install --quiet --upgrade pip
"$PYTHON" -m pip install --quiet -r "$SCRIPT_DIR/requirements.txt"
echo "✓ Dependencies installed"

# ---------------------------------------------------------------------------
# 3. Create .env if missing
# ---------------------------------------------------------------------------
ENV_FILE="$SCRIPT_DIR/.env"
if [[ ! -f "$ENV_FILE" ]]; then
    cp "$SCRIPT_DIR/.env.example" "$ENV_FILE"
    echo
    echo "✓ Created .env from .env.example"
fi

# ---------------------------------------------------------------------------
# 4. Prompt for Anthropic API key
# ---------------------------------------------------------------------------
echo
if grep -q "sk-ant-\.\.\." "$ENV_FILE" 2>/dev/null || ! grep -q "ANTHROPIC_API_KEY=sk-" "$ENV_FILE" 2>/dev/null; then
    read -rsp "Enter your Anthropic API key (starts with sk-ant-): " API_KEY
    echo
    if [[ -n "$API_KEY" ]]; then
        # Replace or append
        if grep -q "^ANTHROPIC_API_KEY=" "$ENV_FILE"; then
            sed -i '' "s|^ANTHROPIC_API_KEY=.*|ANTHROPIC_API_KEY=$API_KEY|" "$ENV_FILE"
        else
            echo "ANTHROPIC_API_KEY=$API_KEY" >> "$ENV_FILE"
        fi
        echo "✓ API key saved to .env"
    else
        echo "⚠ No API key entered. Edit .env manually before running."
    fi
else
    echo "✓ Anthropic API key already set in .env"
fi

# ---------------------------------------------------------------------------
# 5. Gmail credentials directory
# ---------------------------------------------------------------------------
mkdir -p "$CONFIG_DIR"
echo
echo "✓ Config directory ready at $CONFIG_DIR"
if [[ ! -f "$CONFIG_DIR/gmail_credentials.json" ]]; then
    echo
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo " Gmail setup (optional)"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo " To enable Gmail integration:"
    echo "  1. Go to console.cloud.google.com"
    echo "  2. Create a project → enable the Gmail API"
    echo "  3. Create OAuth 2.0 Desktop credentials"
    echo "  4. Download the JSON and save to:"
    echo "     $CONFIG_DIR/gmail_credentials.json"
    echo "  5. Re-run this script or run main.py — it will open a browser"
    echo "     to complete OAuth on first use."
    echo
fi

# ---------------------------------------------------------------------------
# 6. Google Maps Takeout reminder
# ---------------------------------------------------------------------------
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " Google Maps Timeline setup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " Export your location history at takeout.google.com:"
echo "  → Select 'Location History (Timeline)' only"
echo "  → After download, unzip to ~/Downloads/Takeout"
echo " The expected path:"
echo "   ~/Downloads/Takeout/Location History/Semantic Location History"
echo " (Or update takeout_path in config.yaml)"
echo

# ---------------------------------------------------------------------------
# 7. Screen Time — Full Disk Access reminder
# ---------------------------------------------------------------------------
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " macOS Screen Time setup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " Grant Full Disk Access to Terminal (or your Python process):"
echo "  System Settings → Privacy & Security → Full Disk Access → +"
echo "  Add: /Applications/Utilities/Terminal.app"
echo

# ---------------------------------------------------------------------------
# 8. Install launchd agent for daily automation (optional)
# ---------------------------------------------------------------------------
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " Automation (launchd) — run at 07:00 daily"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
read -rp "Install launchd agent to run automatically every morning? [y/N] " INSTALL_AGENT
if [[ "${INSTALL_AGENT,,}" == "y" ]]; then
    API_KEY_IN_ENV=$(grep -E "^ANTHROPIC_API_KEY=" "$ENV_FILE" | cut -d= -f2- || echo "")

    # Patch the plist with real paths and API key
    sed \
        -e "s|REPLACE_WITH_FULL_PATH_TO|$SCRIPT_DIR|g" \
        -e "s|REPLACE_WITH_YOUR_API_KEY|$API_KEY_IN_ENV|g" \
        -e "s|REPLACE_WITH_YOUR_USERNAME|$(whoami)|g" \
        -e "s|/usr/local/bin/python3|$PYTHON|g" \
        "$PLIST_SRC" > "$PLIST_DST"

    launchctl unload "$PLIST_DST" 2>/dev/null || true
    launchctl load "$PLIST_DST"
    echo "✓ launchd agent installed — will run daily at 07:00"
    echo "  Logs: /tmp/daily-retro.log  (errors: /tmp/daily-retro-error.log)"
else
    echo "Skipped. Run manually with: python3 $SCRIPT_DIR/main.py"
fi

echo
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " Setup complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo " Quick test (dry-run, no Claude call):"
echo "   cd $SCRIPT_DIR && python3 main.py --collect-only"
echo " Full run for yesterday:"
echo "   cd $SCRIPT_DIR && python3 main.py"
echo " Specific date:"
echo "   cd $SCRIPT_DIR && python3 main.py --date 2026-03-27"
echo
