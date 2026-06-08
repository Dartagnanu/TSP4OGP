#!/bin/sh
set -e
if [ -d /usr/src/app/store-editor/server ]; then
  SERVER_DIR="/usr/src/app/store-editor/server"
  APP_ROOT="/usr/src/app"
  NODE_ENTRY="store-editor/server/index.js"
else
  SERVER_DIR="/usr/src/app/server"
  APP_ROOT="/usr/src/app"
  NODE_ENTRY="server/index.js"
fi
if [ ! -f "$SERVER_DIR/node_modules/mongoose/package.json" ]; then
  echo "Installing server dependencies (Linux)..."
  cd "$SERVER_DIR" && npm install --omit=dev
fi
cd "$APP_ROOT"
exec node "$NODE_ENTRY"
