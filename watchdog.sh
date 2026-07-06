#!/bin/bash
cd /home/z/my-project
while true; do
  if ! ss -tlnp 2>/dev/null | grep -q ':3000 '; then
    echo "[$(date)] Starting production server..."
    node .next/standalone/server.js -p 3000 > /tmp/prod.log 2>&1 &
    SRVPID=$!
    echo "[$(date)] PID=$SRVPID"
    while kill -0 $SRVPID 2>/dev/null; do
      sleep 2
    done
    echo "[$(date)] Server died, restarting in 2s..."
    sleep 2
  else
    sleep 2
  fi
done
