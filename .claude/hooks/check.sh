#!/usr/bin/env bash
cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null
f=$(jq -r '.tool_input.file_path // empty')
[ -n "$f" ] && [ -f "$f" ] || exit 0
case "$f" in
  *.php)
    command -v php >/dev/null || exit 0
    out=$(php -l "$f" 2>&1) || { echo "$out" >&2; exit 2; } ;;
  *.json)
    out=$(jq empty "$f" 2>&1) || { echo "$out" >&2; exit 2; } ;;
  *.js|*.jsx|*.ts|*.tsx|*.mjs)
    [ -x node_modules/.bin/eslint ] || exit 0
    out=$(node_modules/.bin/eslint "$f" 2>&1); rc=$?
    [ $rc -eq 1 ] && { echo "$out" | head -30 >&2; exit 2; } ;;
esac
exit 0
