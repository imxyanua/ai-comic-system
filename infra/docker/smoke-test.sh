#!/usr/bin/env bash
# Milestone 1 end to end: register, create one panel, generate with the mock worker, download the PNG.
set -euo pipefail

API="${API_BASE_URL:-http://localhost:3000}"
WEB="${WEB_URL:-http://localhost:5173}"

wait_for() {
  local url="$1"
  for _ in $(seq 1 60); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done
  echo "timeout waiting for $url" >&2
  return 1
}

post() {
  curl -fsS -X POST "$API$1" -H "Content-Type: application/json" ${TOKEN:+-H "Authorization: Bearer $TOKEN"} -d "$2"
}

get() {
  curl -fsS "$API$1" -H "Authorization: Bearer $TOKEN"
}

wait_for "$API/health"
wait_for "$WEB"

EMAIL="smoke-$(date +%s)@example.com"
PASSWORD="smoke-password"
TOKEN=""
post /api/v1/auth/register "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" >/dev/null
TOKEN="$(post /api/v1/auth/login "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" | jq -r .access_token)"

COMIC_ID="$(post /api/v1/comics '{"title":"Smoke","style_guide":"ink"}' | jq -r .id)"
SCENE_ID="$(post "/api/v1/comics/$COMIC_ID/scenes" '{"summary":"a street after rain"}' | jq -r .id)"
PANEL_ID="$(post "/api/v1/scenes/$SCENE_ID/panels" '{}' | jq -r .id)"

STATUS_CODE="$(curl -sS -o /tmp/generate.json -w '%{http_code}' -X POST "$API/api/v1/panels/$PANEL_ID/generate" \
  -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" -d '{}')"
if [ "$STATUS_CODE" != "202" ]; then
  echo "generate returned $STATUS_CODE: $(cat /tmp/generate.json)" >&2
  exit 1
fi
JOB_ID="$(jq -r .job_id /tmp/generate.json)"

JOB_STATUS=""
for _ in $(seq 1 30); do
  JOB="$(get "/api/v1/jobs/$JOB_ID")"
  JOB_STATUS="$(echo "$JOB" | jq -r .status)"
  if [ "$JOB_STATUS" = "succeeded" ] || [ "$JOB_STATUS" = "failed" ]; then
    break
  fi
  sleep 2
done
if [ "$JOB_STATUS" != "succeeded" ]; then
  echo "job ended as '$JOB_STATUS': $JOB" >&2
  exit 1
fi

ASSET_ID="$(echo "$JOB" | jq -r .result_asset_id)"
DOWNLOAD_URL="$(get "/api/v1/assets/$ASSET_ID" | jq -r .download_url)"
curl -fsS "$DOWNLOAD_URL" -o /tmp/panel.png
if [ "$(head -c 8 /tmp/panel.png | od -An -tx1 | tr -d ' \n')" != "89504e470d0a1a0a" ]; then
  echo "downloaded file is not a PNG" >&2
  exit 1
fi

PANEL_STATUS="$(get "/api/v1/scenes/$SCENE_ID/panels" | jq -r '.[0].generation_status')"
if [ "$PANEL_STATUS" != "succeeded" ]; then
  echo "panel status is '$PANEL_STATUS'" >&2
  exit 1
fi

echo "smoke test passed: job $JOB_ID, asset $ASSET_ID"
