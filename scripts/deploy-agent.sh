#!/usr/bin/env bash
# Wrapper — calls the standalone installer
exec bash "$(dirname "$0")/install-agent.sh" "$@"
