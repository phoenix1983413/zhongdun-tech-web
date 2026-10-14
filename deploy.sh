#!/usr/bin/env bash
# 一键发布到 GitHub Pages（gh-pages 分支）
set -euo pipefail

REPO="phoenix1983413/zhongdun-tech-web"
BRANCH="gh-pages"
SRC="$(cd "$(dirname "$0")" && pwd)"
TMP="$(mktemp -d)"

cd "$SRC"

echo "▶ 构建…"
npm run build

echo "▶ 复制产物到临时目录…"
cp -R dist/. "$TMP/"
: > "$TMP/.nojekyll"

cd "$TMP"
git init -q -b "$BRANCH"
git add -A
git -c user.name="deploy" -c user.email="deploy@local" commit -q -m "deploy: $(date '+%Y-%m-%d %H:%M:%S')"

echo "▶ 推送到 $REPO ($BRANCH)…"
git push -f "https://github.com/$REPO.git" "$BRANCH"

echo "✅ 发布完成：https://phoenix1983413.github.io/zhongdun-tech-web/"
