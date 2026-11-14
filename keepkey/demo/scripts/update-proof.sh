#!/bin/sh
# Proves 0.0.1 -> 0.0.2 through Electrobun's updater against a local server.
# Builds both versions, serves 0.0.2's update artifacts, then tells you how to
# run 0.0.1 with DEMO_APPLY_UPDATE=1 and confirm it relaunches as 0.0.2.
set -eu
cd "$(dirname "$0")/.."
port=18647
url="http://127.0.0.1:$port"
proof=".proof/$(date +%s)"
mkdir -p "$proof/v1" "$proof/v2"
DEMO_VERSION=0.0.2 DEMO_UPDATE_URL="$url" hutch electrobun build --env=stable
cp -R artifacts/. "$proof/v2/"
DEMO_VERSION=0.0.1 DEMO_UPDATE_URL="$url" hutch electrobun build --env=stable
cp -R artifacts/. "$proof/v1/"
echo "v1 (install this):"; ls "$proof/v1"
echo "v2 (served):"; ls "$proof/v2"
echo "Serving $proof/v2 at $url. Launch v1 with DEMO_APPLY_UPDATE=1 DEMO_HEADLESS=1;"
echo "after relaunch updater-local-info must read 'version 0.0.2'."
cd "$proof/v2"
exec hutch -e "Bun.serve({port:$port,hostname:'127.0.0.1',fetch:r=>new Response(Bun.file('.'+decodeURIComponent(new URL(r.url).pathname)))}); console.log('serving')"
