#!/usr/bin/env bash
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0
[ -z "$(git status --porcelain)" ] && exit 0

# front 폴더의 .commit_message.txt 파일 참조
MSG_FILE="$(git rev-parse --show-toplevel)/.commit_message.txt"
[ -s "$MSG_FILE" ] || exit 0
[ -z "$(cat "$MSG_FILE")" ] && exit 0

# 파일 내용 검증 (바이너리 데이터 체크)
if ! cat "$MSG_FILE" >/dev/null 2>&1; then
    echo "Error: Invalid characters in commit message file" >&2
    exit 1
fi

git add -A
git commit -F "$MSG_FILE" -q

# 작업 완료 알림 (커밋 메시지 포함)
COMMIT_MSG=$(cat "$MSG_FILE")
terminal-notifier -message "$COMMIT_MSG" -title "Claude Code - Front 커밋 완료" -sound Glass

# 커밋 후 메시지 파일 비우기 (비활성화)
# > "$MSG_FILE"
