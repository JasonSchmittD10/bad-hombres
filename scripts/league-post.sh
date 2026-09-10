#!/usr/bin/env bash
# Compose and post one league update, once.
#
#   scripts/league-post.sh opener|progress|recap|bonus
#   DRY_RUN=1 scripts/league-post.sh recap    # show it, send nothing
#
# Skips silently (exit 0) when there is nothing worth posting or when this
# post already went out for this week -- so a scheduled run that fires twice,
# or fires before the data is ready, does nothing rather than something wrong.
set -euo pipefail
cd "$(dirname "$0")/.."

kind=${1:?usage: league-post.sh opener|progress|recap|bonus}
state="${BH_POST_STATE:-$HOME/.bad-hombres-posts.json}"
[ -f "$state" ] || echo '{}' > "$state"

tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
msg="$tmp/msg.txt"; err="$tmp/err.txt"

if ! ./scripts/compose-post.py "$kind" > "$msg" 2> "$err"; then
  echo "skip ($kind): $(cat "$err")"; exit 0
fi

week=$(python3 -c "import json;print(json.load(open('data/week.json')).get('week','?'))")
key="$kind-w$week"
# the recap is keyed to the article, so a new story in the same week still posts
if [ "$kind" = "recap" ]; then
  slug=$(grep -o '<a class="feature" href="[^"]*"' index.html | head -1 | sed 's/.*href="//;s/"//')
  key="recap-$slug"
fi

if python3 -c "
import json,sys
s=json.load(open('$state'))
sys.exit(0 if '$key' in s else 1)"; then
  echo "skip ($kind): already posted [$key]"; exit 0
fi

img=$(sed -n 's/^ATTACH://p' "$err" | head -1 || true)
if [ -n "$img" ]; then ./scripts/imessage-post.sh "$msg" "$img"; else ./scripts/imessage-post.sh "$msg"; fi

if [ "${DRY_RUN:-0}" != "1" ]; then
  python3 -c "
import json,datetime
s=json.load(open('$state'))
s['$key']=datetime.datetime.now().astimezone().replace(microsecond=0).isoformat()
json.dump(s,open('$state','w'),indent=1)"
  echo "recorded [$key]"
fi
