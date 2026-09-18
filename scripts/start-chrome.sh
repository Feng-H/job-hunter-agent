#!/usr/bin/env bash

# 定义求职专用 Chrome 用户数据目录，避免污染日常浏览器
if [[ "$OSTYPE" == "darwin"* ]]; then
  CHROME_PROFILE_DIR="$HOME/Library/Application Support/Google/Chrome/JobHunterProfile"
  CHROME_EXEC="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
else
  CHROME_PROFILE_DIR="$HOME/.config/google-chrome/JobHunterProfile"
  if command -v google-chrome-stable >/dev/null 2>&1; then
    CHROME_EXEC="$(command -v google-chrome-stable)"
  elif command -v google-chrome >/dev/null 2>&1; then
    CHROME_EXEC="$(command -v google-chrome)"
  elif command -v chromium >/dev/null 2>&1; then
    CHROME_EXEC="$(command -v chromium)"
  elif command -v chromium-browser >/dev/null 2>&1; then
    CHROME_EXEC="$(command -v chromium-browser)"
  else
    CHROME_EXEC=""
  fi
fi

mkdir -p "$CHROME_PROFILE_DIR"

if [ -z "$CHROME_EXEC" ] || [ ! -e "$CHROME_EXEC" ]; then
  echo "❌ 未找到 Google Chrome 或 Chromium，请确认已安装或指定路径。"
  exit 1
fi

echo "🚀 正在启动求职专用 Chrome (已开启 9222 调试端口)..."
echo "📂 数据目录: $CHROME_PROFILE_DIR"
echo "💡 提示: 浏览器打开后，包含【Boss直聘】、【猎聘网】、【智联招聘】三大标签页，请正常登录你的账号。"

"$CHROME_EXEC" \
  --remote-debugging-port=9222 \
  --user-data-dir="$CHROME_PROFILE_DIR" \
  --no-first-run \
  --no-default-browser-check \
  "https://www.zhipin.com" \
  "https://www.liepin.com" \
  "https://www.zhaopin.com" &
