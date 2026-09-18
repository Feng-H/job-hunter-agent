#!/usr/bin/env bash

# Job-Hunter OS 独立系统管理启动器
# 可以在任意系统终端独立执行，完全脱离 pi agent

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_FILE="$PROJECT_DIR/logs/job-hunter.pid"
LOG_FILE="$PROJECT_DIR/logs/job-hunter.log"

mkdir -p "$PROJECT_DIR/logs"

case "$1" in
  start)
    if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
      echo "⚠️ Job-Hunter OS 已经在后台运行中 (PID: $(cat "$PID_FILE"))"
      echo "👉 Web 可视化看板: http://127.0.0.1:8765"
      exit 0
    fi

    echo "🚀 正在启动 Job-Hunter OS (Web看板 + LLM底座 + 巡检服务)..."
    cd "$PROJECT_DIR"
    nohup npx tsx src/server.ts >> "$LOG_FILE" 2>&1 &
    echo $! > "$PID_FILE"
    sleep 1
    echo "✅ 启动成功！PID: $(cat "$PID_FILE")"
    echo "👉 浏览器打开看板: http://127.0.0.1:8765"
    echo "📜 日志文件: $LOG_FILE"
    ;;

  open|dashboard)
    echo "🌐 正在打开 Job-Hunter OS Web 看板..."
    if command -v open >/dev/null 2>&1; then
      open "http://127.0.0.1:8765"
    elif command -v xdg-open >/dev/null 2>&1; then
      xdg-open "http://127.0.0.1:8765"
    else
      echo "👉 请在浏览器中打开: http://127.0.0.1:8765"
    fi
    ;;

  scan)
    echo "⚡ 正在执行单次极速全渠道扫描并同步到飞书与看板..."
    cd "$PROJECT_DIR" && npx tsx src/standalone.ts scan
    ;;

  status)
    cd "$PROJECT_DIR" && npx tsx src/standalone.ts status
    ;;

  stop)
    if [ ! -f "$PID_FILE" ] || ! kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
      echo "ℹ️ Job-Hunter OS 未在运行"
      rm -f "$PID_FILE"
      exit 0
    fi

    PID=$(cat "$PID_FILE")
    echo "🛑 正在停止 Job-Hunter OS (PID: $PID)..."
    kill "$PID" 2>/dev/null
    rm -f "$PID_FILE"
    echo "✅ 已成功停止！"
    ;;

  logs)
    if [ ! -f "$LOG_FILE" ]; then
      touch "$LOG_FILE"
    fi
    echo "📜 正在跟踪实时日志 (按 Ctrl+C 退出)..."
    tail -f "$LOG_FILE"
    ;;

  *)
    echo "=================================================="
    echo "🎯 Job-Hunter OS 独立系统管理控制台"
    echo "=================================================="
    echo "用法:"
    echo "  ./job-hunter.sh start       # 启动 Web看板 + 调度守护进程"
    echo "  ./job-hunter.sh open        # 直接在浏览器打开求职看板 (http://127.0.0.1:8765)"
    echo "  ./job-hunter.sh scan        # 立即提取当前页面职位并推送飞书"
    echo "  ./job-hunter.sh status      # 命令行查看求职进度看板"
    echo "  ./job-hunter.sh stop        # 停止后台服务"
    echo "  ./job-hunter.sh logs        # 实时查看后台运行日志"
    echo "=================================================="
    ;;
esac
