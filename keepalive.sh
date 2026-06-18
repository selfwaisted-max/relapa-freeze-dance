#!/usr/bin/env bash
# Watchdog: restarts the Next.js dev server (port 3000) if it dies.
# Must be launched via `setsid --fork` so it becomes an orphaned daemon (PPID=1).
cd /home/z/my-project
while true; do
  if ! curl -s -o /dev/null --max-time 3 http://127.0.0.1:3000/ >/dev/null 2>&1; then
    # server down (or not responding) -> (re)start it
    pkill -f "next/dist/bin/next dev" >/dev/null 2>&1
    sleep 1
    setsid --fork bash -c 'cd /home/z/my-project && exec bun node_modules/next/dist/bin/next dev -p 3000' </dev/null >>/home/z/my-project/dev.log 2>&1
    # wait for ready
    for i in $(seq 1 30); do
      curl -s -o /dev/null --max-time 3 http://127.0.0.1:3000/ >/dev/null 2>&1 && break
      sleep 1
    done
  fi
  sleep 10
done
