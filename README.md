# Trello MCP Server

An [MCP (Model Context Protocol)](https://modelcontextprotocol.io) server that connects [Trello](https://trello.com) to Claude.ai as a custom connector.

## Why This Exists

Claude.ai does not have a native Trello connector in its official directory. This MCP server fills that gap — once running, you can register it as a **custom connector** in Claude.ai and interact with your Trello boards, lists, and cards directly from Claude conversations.

## Prerequisites

- Node.js 18+
- A Trello account
- Claude.ai Pro/Max/Team/Enterprise plan (required for custom connectors)

## Setup

### 1. Get Trello API credentials

1. Go to https://trello.com/power-ups/admin and create a Power-Up to get your **API Key**
2. Generate a **Token** by visiting:
   ```
   https://trello.com/1/authorize?expiration=never&scope=read,write&response_type=token&key=YOUR_API_KEY
   ```

### 2. Install and build

```bash
npm install
npm run build
```

### 3. Set environment variables

```bash
export TRELLO_API_KEY=your_api_key_here
export TRELLO_TOKEN=your_token_here
```

### 4. Run the server

```bash
npm start
```

## Connecting to Claude.ai

1. Go to **Claude.ai → Settings → Connectors**
2. Click **"Add custom connector"**
3. Enter a name (e.g., "Trello") and the MCP server URL
4. Save — Claude will now have access to your Trello workspace

For **Claude Desktop**, add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "trello": {
      "command": "node",
      "args": ["/path/to/this/repo/dist/index.js"],
      "env": {
        "TRELLO_API_KEY": "your_api_key",
        "TRELLO_TOKEN": "your_token"
      }
    }
  }
}
```

## Available Tools

| Tool | Description |
|------|-------------|
| `get_boards` | List all your open Trello boards |
| `get_lists` | Get all lists on a board |
| `get_cards` | Get all open cards on a board |
| `get_cards_by_list` | Get cards in a specific list |
| `create_card` | Create a new card in a list |
| `update_card` | Update a card's name, description, or due date |
| `move_card` | Move a card to a different list |
| `archive_card` | Archive a card |
| `add_comment` | Add a comment to a card |
| `create_list` | Create a new list on a board |

## Example Usage in Claude

Once connected, you can ask Claude things like:

- *"Show me all my Trello boards"*
- *"What cards are in the 'In Progress' list on my Project board?"*
- *"Create a card called 'Fix login bug' in the To Do list"*
- *"Move the 'Deploy to production' card to Done"*
- *"Add a comment to the API integration card saying 'Needs review'"*
