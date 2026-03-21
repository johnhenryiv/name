import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { TrelloClient } from "./trello-client.js";
import { TOOLS } from "./tools.js";

const apiKey = process.env.TRELLO_API_KEY;
const token = process.env.TRELLO_TOKEN;

if (!apiKey || !token) {
  console.error("Error: TRELLO_API_KEY and TRELLO_TOKEN environment variables are required.");
  process.exit(1);
}

const trello = new TrelloClient(apiKey, token);

const server = new Server(
  { name: "trello-mcp-server", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;

  try {
    switch (name) {
      case "get_boards": {
        const boards = await trello.getBoards();
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(boards, null, 2),
            },
          ],
        };
      }

      case "get_lists": {
        const { board_id } = args as { board_id: string };
        const lists = await trello.getLists(board_id);
        return {
          content: [{ type: "text", text: JSON.stringify(lists, null, 2) }],
        };
      }

      case "get_cards": {
        const { board_id } = args as { board_id: string };
        const cards = await trello.getCards(board_id);
        return {
          content: [{ type: "text", text: JSON.stringify(cards, null, 2) }],
        };
      }

      case "get_cards_by_list": {
        const { list_id } = args as { list_id: string };
        const cards = await trello.getCardsByList(list_id);
        return {
          content: [{ type: "text", text: JSON.stringify(cards, null, 2) }],
        };
      }

      case "create_card": {
        const { list_id, name: cardName, desc, due } = args as {
          list_id: string;
          name: string;
          desc?: string;
          due?: string;
        };
        const card = await trello.createCard({ listId: list_id, name: cardName, desc, due });
        return {
          content: [{ type: "text", text: JSON.stringify(card, null, 2) }],
        };
      }

      case "update_card": {
        const { card_id, name: cardName, desc, due } = args as {
          card_id: string;
          name?: string;
          desc?: string;
          due?: string;
        };
        const card = await trello.updateCard(card_id, { name: cardName, desc, due });
        return {
          content: [{ type: "text", text: JSON.stringify(card, null, 2) }],
        };
      }

      case "move_card": {
        const { card_id, list_id } = args as { card_id: string; list_id: string };
        const card = await trello.moveCard(card_id, list_id);
        return {
          content: [{ type: "text", text: JSON.stringify(card, null, 2) }],
        };
      }

      case "archive_card": {
        const { card_id } = args as { card_id: string };
        const card = await trello.archiveCard(card_id);
        return {
          content: [{ type: "text", text: JSON.stringify(card, null, 2) }],
        };
      }

      case "add_comment": {
        const { card_id, text } = args as { card_id: string; text: string };
        const comment = await trello.addComment(card_id, text);
        return {
          content: [{ type: "text", text: JSON.stringify(comment, null, 2) }],
        };
      }

      case "create_list": {
        const { board_id, name: listName } = args as { board_id: string; name: string };
        const list = await trello.createList(board_id, listName);
        return {
          content: [{ type: "text", text: JSON.stringify(list, null, 2) }],
        };
      }

      default:
        return {
          content: [{ type: "text", text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: "text", text: `Error: ${message}` }],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Trello MCP server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
