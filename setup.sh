#!/bin/bash
# One-time setup for WSB Signals — run this once on any new Mac.
set -e

echo "Installing Python packages..."
pip3 install requests yfinance --quiet

echo "Installing Node packages..."
npm install --silent

CLAUDE_CONFIG="$HOME/Library/Application Support/Claude/claude_desktop_config.json"
MCP_SERVER="$(pwd)/mcp/server.mjs"

echo "Configuring Claude Desktop..."
mkdir -p "$HOME/Library/Application Support/Claude"

if [ -f "$CLAUDE_CONFIG" ]; then
  # Config exists — check if wsb-signals is already there
  if grep -q "wsb-signals" "$CLAUDE_CONFIG"; then
    echo "Claude Desktop already configured."
  else
    echo ""
    echo "Claude Desktop config already exists. Add this manually to $CLAUDE_CONFIG:"
    echo ""
    echo '  "wsb-signals": {'
    echo "    \"command\": \"node\","
    echo "    \"args\": [\"$MCP_SERVER\"]"
    echo '  }'
  fi
else
  # Fresh install — write the config
  cat > "$CLAUDE_CONFIG" << EOF
{
  "mcpServers": {
    "wsb-signals": {
      "command": "node",
      "args": ["$MCP_SERVER"]
    }
  }
}
EOF
  echo "Claude Desktop configured."
fi

echo ""
echo "Done! Restart Claude Desktop and look for the hammer icon in the chat bar."
echo "No other startup steps needed — everything runs automatically."
