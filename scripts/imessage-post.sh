#!/usr/bin/env bash
# Post to the league group thread.
#
#   scripts/imessage-post.sh <message-file> [image-path]
#   DRY_RUN=1 scripts/imessage-post.sh ...   # resolve + report, send nothing
#
# The message comes from a FILE, not an argument: AppleScript string escaping
# is a minefield and the recaps contain quotes, apostrophes and em dashes.
# Requires Messages running and signed in on this Mac.
set -euo pipefail

CHAT_ID="${BH_CHAT_ID:-any;+;chat797144106140278556}"
msg_file=${1:?usage: imessage-post.sh <message-file> [image-path]}
img=${2:-}

[ -f "$msg_file" ] || { echo "no such message file: $msg_file" >&2; exit 1; }
[ -s "$msg_file" ] || { echo "refusing to send an empty message" >&2; exit 1; }
if [ -n "$img" ] && [ ! -f "$img" ]; then
  echo "attachment missing: $img" >&2; exit 1
fi

if [ "${DRY_RUN:-0}" = "1" ]; then
  echo "── DRY RUN — nothing sent ─────────────────────"
  osascript -e "tell application \"Messages\" to return name of (a reference to chat id \"$CHAT_ID\")" \
    | sed 's/^/thread: /'
  echo "chars: $(wc -c < "$msg_file" | tr -d ' ')"
  [ -n "$img" ] && echo "attachment: $img ($(wc -c < "$img" | tr -d ' ') bytes)"
  echo "───────────────────────────────────────────────"
  cat "$msg_file"
  exit 0
fi

osascript <<APPLESCRIPT
set msgText to (do shell script "cat " & quoted form of "$msg_file")
tell application "Messages"
	set targetChat to a reference to chat id "$CHAT_ID"
	send msgText to targetChat
	$( [ -n "$img" ] && echo "send POSIX file \"$img\" to targetChat" )
end tell
APPLESCRIPT
echo "posted to the league thread"
