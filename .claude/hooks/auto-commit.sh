#!/usr/bin/env bash
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0
[ -z "$(git status --porcelain)" ] && exit 0

# front 폴더의 .commit_message.txt 파일 참조
MSG_FILE="$(git rev-parse --show-toplevel)/.commit_message.txt"
[ -s "$MSG_FILE" ] || exit 0
[ -z "$(cat "$MSG_FILE")" ] && exit 0

git add -A
git commit -F "$MSG_FILE" -q

# 커밋 후 메시지 파일 비우기
> "$MSG_FILE"
