#!/usr/bin/env bash
# Builds ../TrustVault_Project.zip (no node_modules, no .env, no build output).
set -euo pipefail
cd "$(dirname "$0")/../.."
rm -f TrustVault_Project.zip
zip -rq TrustVault_Project.zip trustvault \
  -x 'trustvault/node_modules/*' 'trustvault/*/node_modules/*' 'trustvault/frontend/dist/*' \
     'trustvault/.env' 'trustvault/*/.env' 'trustvault/.git/*' '*.log'
unzip -l TrustVault_Project.zip | tail -1
