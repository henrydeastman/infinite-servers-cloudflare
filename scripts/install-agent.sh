#!/usr/bin/env bash
#
# Infinite Servers — Agent Installer
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/zhojielun/infinite-servers-cloudflare/master/scripts/install-agent.sh | sudo bash
#
# Or with env vars:
#   sudo AGENT_NAME="My Box" DASHBOARD_URL="https://xxx.workers.dev" \
#        AGENT_TOKEN="..." AGENT_INTERVAL=15 \
#        curl -fsSL ... | bash
#
set -euo pipefail

die()  { printf '\033[31merror:\033[0m %s\n' "$*" >&2; exit 1; }
info() { printf '\033[36m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[33mwarn:\033[0m %s\n' "$*" >&2; }

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

# ── prompt for config ────────────────────────────────────────────────────
NAME="${AGENT_NAME:-}"
[ -n "$NAME" ] || prompt NAME "Server name (must match dashboard config)" "$(hostname)"
NAME="${NAME//[^a-zA-Z0-9 _-]/}"

URL="${DASHBOARD_URL:-}"; TOKEN="${AGENT_TOKEN:-}"; INTERVAL="${AGENT_INTERVAL:-}"
[ -n "$URL" ] || prompt URL "Dashboard URL (e.g. https://infinite-servers.xxx.workers.dev)" ""
[ -n "$URL" ] || die "dashboard URL is required"
[ -n "$TOKEN" ] || prompt TOKEN "Token (leave blank to auto-generate)" ""
[ -n "$TOKEN" ] || TOKEN="$(gen_token)"
[ -n "$INTERVAL" ] || prompt INTERVAL "Push interval in seconds" "15"

PUSH_URL="${URL%/}/push"

# ── install agent ────────────────────────────────────────────────────────
INSTALL_DIR="/opt/infinite-servers/agents"
AGENT_HOME="$INSTALL_DIR/$NAME"
mkdir -p "$AGENT_HOME"

# write agent runner script
cat > "$AGENT_HOME/agent.sh" <<'AGENTSCRIPT'
#!/usr/bin/env bash
set -uo pipefail

CONFIG="$1"
INTERVAL="${2:-15}"

read_json_field() {
    # simple json parser: extracts "key": "value" or "key": value
    grep -oP "\"$1\"\s*:\s*\"?\K[^\"$,]+" || echo ""
}

NAME=$(read_json_field "name" < "$CONFIG")
TOKEN=$(read_json_field "token" < "$CONFIG")
URL=$(read_json_field "url" < "$CONFIG")

get_ip() {
    curl -s --max-time 5 https://ifconfig.me 2>/dev/null \
    || curl -s --max-time 5 https://api.ipify.org 2>/dev/null \
    || hostname -I 2>/dev/null | awk '{print $1}' \
    || echo "0.0.0.0"
}

collect_info() {
    local ip
    ip=$(get_ip)

    # CPU
    local cpu_model cpu_num
    cpu_model=$(grep -m1 'model name' /proc/cpuinfo 2>/dev/null | cut -d: -f2 | sed 's/^ //' || echo "Unknown")
    cpu_num=$(nproc 2>/dev/null || grep -c '^processor' /proc/cpuinfo 2>/dev/null || echo 1)

    # Memory
    local mem_total mem_used mem_pct
    if command -v free >/dev/null 2>&1; then
        mem_total=$(free -b | awk '/^Mem:/{print $2}')
        mem_used=$(free -b | awk '/^Mem:/{print $3}')
        mem_pct=$(awk "BEGIN{printf \"%.1f\", ($mem_used/$mem_total)*100}")
    else
        mem_total=0; mem_used=0; mem_pct=0
    fi

    # Swap
    local swap_total swap_pct
    if command -v free >/dev/null 2>&1; then
        swap_total=$(free -b | awk '/^Swap:/{print $2}')
        swap_pct=$(free -b | awk '/^Swap:/{printf "%.1f", ($2>0)?$3/$2*100:0}')
    else
        swap_total=0; swap_pct=0
    fi

    # Disk
    local disk_total disk_pct
    disk_total=$(df -B1 / 2>/dev/null | awk 'NR==2{print $2}' || echo 0)
    disk_pct=$(df / 2>/dev/null | awk 'NR==2{gsub(/%/,""); print $5}' || echo 0)

    # Load
    local load1
    load1=$(awk '{print $1}' /proc/loadavg 2>/dev/null || echo 0)

    # Uptime
    local uptime_sec
    uptime_sec=$(awk '{print int($1)}' /proc/uptime 2>/dev/null || echo 0)

    # Network
    local net_rx net_tx
    local iface
    iface=$(ip route 2>/dev/null | awk '/default/{print $5; exit}')
    [ -z "$iface" ] && iface="eth0"
    if [ -f "/sys/class/net/$iface/statistics/rx_bytes" ]; then
        net_rx=$(cat "/sys/class/net/$iface/statistics/rx_bytes")
        net_tx=$(cat "/sys/class/net/$iface/statistics/tx_bytes")
    else
        net_rx=0; net_tx=0
    fi

    # OS
    local distname="Unknown"
    if [ -f /etc/os-release ]; then
        distname=$(awk -F= '/^PRETTY_NAME=/{gsub(/"/,"",$2); print $2}' /etc/os-release)
    fi

    local now
    now=$(date +%s)

    # Build form data
    local enc_name
    enc_name=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$NAME'))" 2>/dev/null || echo "$NAME")
    local data="name=${enc_name}&token=${TOKEN}&time=${now}"
    data+="&cpuinfo[model]=$(python3 -c "import urllib.parse; print(urllib.parse.quote('''$cpu_model'''))" 2>/dev/null || echo "$cpu_model")"
    data+="&cpuinfo[num]=${cpu_num}"
    data+="&meminfo[memTotal]=${mem_total}"
    data+="&meminfo[memUsedPercent]=${mem_pct}"
    data+="&meminfo[swapPercent]=${swap_pct}"
    data+="&diskinfo[diskTotal]=${disk_total}"
    data+="&diskinfo[diskPercent]=${disk_pct}"
    data+="&loadavg=${load1}"
    data+="&uptime=${uptime_sec}"
    data+="&netdev[rx]=${net_rx}"
    data+="&netdev[tx]=${net_tx}"
    data+="&netdev[ts]=$(($(date +%s%N)/1000000))"
    data+="&ip=${ip}"
    data+="&distname=$(python3 -c "import urllib.parse; print(urllib.parse.quote('''$distname'''))" 2>/dev/null || echo "$distname")"

    echo "$data"
}

push_status() {
    local data
    data=$(collect_info)
    curl -s --max-time 10 -X POST "$URL" \
        -H "Content-Type: application/x-www-form-urlencoded" \
        -d "$data" > /dev/null 2>&1 || true
}

push_info() {
    # Static info push (no time field)
    local ip cpu_model cpu_num mem_total disk_total distname
    ip=$(get_ip)
    cpu_model=$(grep -m1 'model name' /proc/cpuinfo 2>/dev/null | cut -d: -f2 | sed 's/^ //' || echo "Unknown")
    cpu_num=$(nproc 2>/dev/null || grep -c '^processor' /proc/cpuinfo 2>/dev/null || echo 1)
    mem_total=$(free -b 2>/dev/null | awk '/^Mem:/{print $2}' || echo 0)
    disk_total=$(df -B1 / 2>/dev/null | awk 'NR==2{print $2}' || echo 0)
    if [ -f /etc/os-release ]; then
        distname=$(awk -F= '/^PRETTY_NAME=/{gsub(/"/,"",$2); print $2}' /etc/os-release)
    else
        distname="Unknown"
    fi

    local enc_name
    enc_name=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$NAME'))" 2>/dev/null || echo "$NAME")
    local data="name=${enc_name}&token=${TOKEN}"
    data+="&cpuinfo[model]=$(python3 -c "import urllib.parse; print(urllib.parse.quote('''$cpu_model'''))" 2>/dev/null || echo "$cpu_model")"
    data+="&cpuinfo[num]=${cpu_num}"
    data+="&meminfo[memTotal]=${mem_total}"
    data+="&diskinfo[diskTotal]=${disk_total}"
    data+="&ip=${ip}"
    data+="&distname=$(python3 -c "import urllib.parse; print(urllib.parse.quote('''$distname'''))" 2>/dev/null || echo "$distname")"

    curl -s --max-time 10 -X POST "$URL" \
        -H "Content-Type: application/x-www-form-urlencoded" \
        -d "$data" > /dev/null 2>&1 || true
}

# push static info first
push_info

# main loop
while true; do
    push_status
    sleep "$INTERVAL"
done
AGENTSCRIPT
chmod +x "$AGENT_HOME/agent.sh"

# write config
umask 077
cat > "$AGENT_HOME/agent.json" <<JSON
{
    "name": "$NAME",
    "token": "$TOKEN",
    "url": "$PUSH_URL",
    "interval": $INTERVAL
}
JSON

info "config written to $AGENT_HOME/agent.json"

# ── test push ────────────────────────────────────────────────────────────
info "testing push to $PUSH_URL ..."
TEST_DATA="name=${NAME}&token=${TOKEN}&time=$(date +%s)&cpuinfo[num]=1&meminfo[memTotal]=0&meminfo[memUsedPercent]=0&diskinfo[diskTotal]=0&diskinfo[diskPercent]=0&loadavg=0&uptime=0&netdev[rx]=0&netdev[tx]=0&netdev[ts]=$(($(date +%s%N)/1000000))&ip=0.0.0.0&distname=test"
RESULT=$(curl -s --max-time 10 -X POST "$PUSH_URL" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "$TEST_DATA" 2>&1) || warn "test push failed"
if echo "$RESULT" | grep -q '"ok"'; then
    info "test push successful"
else
    warn "test push returned: $RESULT"
fi

# ── setup systemd service ────────────────────────────────────────────────
SERVICE_NAME="infinite-agent-${NAME// /-}"
if command -v systemctl >/dev/null 2>&1; then
    cat > /etc/systemd/system/${SERVICE_NAME}.service <<EOF
[Unit]
Description=Infinite Servers Agent — ${NAME}
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=/bin/bash ${AGENT_HOME}/agent.sh ${AGENT_HOME}/agent.json ${INTERVAL}
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
    info "run manually: bash ${AGENT_HOME}/agent.sh ${AGENT_HOME}/agent.json ${INTERVAL}"
fi

cat <<DONE

$(info "Agent deployed successfully!")

  Server   : $NAME
  Config   : $AGENT_HOME/agent.json
  Pushing  : $PUSH_URL every ${INTERVAL}s
  Token    : $TOKEN
  Service  : ${SERVICE_NAME}

  Add this server to your dashboard's KV config (servers.json):

    "$NAME": {
        "region": "CN",
        "location": "$(hostname)",
        "token": "$TOKEN"
    }

  Manage service:
    sudo systemctl status ${SERVICE_NAME}
    sudo systemctl restart ${SERVICE_NAME}
    sudo journalctl -u ${SERVICE_NAME} -f

DONE
