#!/usr/bin/env bash
#
# Infinite Server — Agent Deployment Script
#
# Usage:
#   sudo ./scripts/deploy-agent.sh
#   sudo AGENT_NAME="My Box" DASHBOARD_URL="https://worker.workers.dev" \
#        AGENT_TOKEN="..." ./scripts/deploy-agent.sh
#
set -euo pipefail

# ── helpers ──────────────────────────────────────────────────────────────
die()  { printf '\033[31merror:\033[0m %s\n' "$*" >&2; exit 1; }
info() { printf '\033[36m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[33mwarn:\033[0m %s\n' "$*" >&2; }

INSTALL_DIR="${INSTALL_DIR:-/opt/infinite-servers/agents}"
SERVICE_NAME="${SERVICE_NAME:-infinite-agent}"

prompt() {
    local __var="$1" __q="$2" __def="${3:-}" __ans=""
    if [ -e /dev/tty ]; then
        if [ -n "$__def" ]; then read -r -p "$__q [$__def]: " __ans </dev/tty || true
        else                       read -r -p "$__q: "        __ans </dev/tty || true
        fi
    fi
    printf -v "$__var" '%s' "${__ans:-$__def}"
}

gen_token() {
    if command -v openssl >/dev/null 2>&1; then openssl rand -hex 24
    else tr -dc 'a-f0-9' </dev/urandom | head -c 48; echo
    fi
}

# ── check PHP ────────────────────────────────────────────────────────────
command -v php >/dev/null 2>&1 || die "PHP not found. Install: apt install php-cli"

# ── prompt for config ────────────────────────────────────────────────────
NAME="${AGENT_NAME:-}"
[ -n "$NAME" ] || prompt NAME "Server name (must match dashboard config)" "$(hostname)"
NAME="${NAME//[^a-zA-Z0-9_-]/}"

AGENT_HOME="$INSTALL_DIR/$NAME"
mkdir -p "$AGENT_HOME"

URL="${DASHBOARD_URL:-}"; TOKEN="${AGENT_TOKEN:-}"
[ -n "$URL" ] || prompt URL "Dashboard URL (e.g. https://infinite-servers.xxx.workers.dev)" ""
[ -n "$URL" ] || die "dashboard URL is required"
if [ -z "$TOKEN" ]; then
    prompt TOKEN "Token (leave blank to auto-generate)" ""
    [ -n "$TOKEN" ] || TOKEN="$(gen_token)"
fi
PUSH_URL="${URL%/}/push"

# ── copy status.php ──────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"

if [ -f "$REPO_ROOT/api/status.php" ]; then
    info "copying status.php from repo"
    cp "$REPO_ROOT/api/status.php" "$AGENT_HOME/status.php"
else
    die "status.php not found at $REPO_ROOT/api/status.php"
fi

# ── write agent config ──────────────────────────────────────────────────
umask 077
cat > "$AGENT_HOME/agent.json" <<JSON
{
    "name": "$NAME",
    "token": "$TOKEN",
    "url": "$PUSH_URL",
    "expose_ip": true
}
JSON

info "config written to $AGENT_HOME/agent.json"

# ── test push ────────────────────────────────────────────────────────────
info "testing push to $PUSH_URL ..."
PHP_BIN="$(command -v php)"

# Push static info
$PHP_BIN "$AGENT_HOME/status.php" s "$AGENT_HOME/agent.json" >/dev/null 2>&1 || warn "info push failed"

# Push status
RESULT=$($PHP_BIN "$AGENT_HOME/status.php" r "$AGENT_HOME/agent.json" 2>&1)
if echo "$RESULT" | grep -q '"time"'; then
    info "push successful!"
else
    warn "push returned: $RESULT"
fi

# ── setup systemd service ────────────────────────────────────────────────
if command -v systemctl >/dev/null 2>&1; then
    cat > /etc/systemd/system/${SERVICE_NAME}.service <<EOF
[Unit]
Description=Infinite Server Push Agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=/bin/bash -c 'while true; do $PHP_BIN $AGENT_HOME/status.php r $AGENT_HOME/agent.json > /dev/null 2>&1; sleep 15; done'
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

    systemctl daemon-reload
    systemctl enable --now ${SERVICE_NAME}
    info "systemd service created and started"
else
    warn "systemd not found, skipping service setup"
fi

cat <<DONE

$(info "Agent deployed successfully!")

  Server  : $NAME
  Config  : $AGENT_HOME/agent.json
  Pushing : $PUSH_URL every 15s
  Token   : $TOKEN

  Add this server to your dashboard's KV config (servers.json):

    "$NAME": {
        "region": "CN",
        "location": "$(hostname)",
        "token": "$TOKEN"
    }

DONE
