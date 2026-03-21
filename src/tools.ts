import { Tool } from "@modelcontextprotocol/sdk/types.js";

export const TOOLS: Tool[] = [
  {
    name: "get_boards",
    description: "List all open Trello boards for the authenticated user",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "get_lists",
    description: "Get all open lists on a Trello board",
    inputSchema: {
      type: "object",
      properties: {
        board_id: {
          type: "string",
          description: "The ID of the Trello board",
        },
      },
      required: ["board_id"],
    },
  },
  {
    name: "get_cards",
    description: "Get all open cards on a Trello board",
    inputSchema: {
      type: "object",
      properties: {
        board_id: {
          type: "string",
          description: "The ID of the Trello board",
        },
      },
      required: ["board_id"],
    },
  },
  {
    name: "get_cards_by_list",
    description: "Get all cards in a specific Trello list",
    inputSchema: {
      type: "object",
      properties: {
        list_id: {
          type: "string",
          description: "The ID of the Trello list",
        },
      },
      required: ["list_id"],
    },
  },
  {
    name: "create_card",
    description: "Create a new card in a Trello list",
    inputSchema: {
      type: "object",
      properties: {
        list_id: {
          type: "string",
          description: "The ID of the list to create the card in",
        },
        name: {
          type: "string",
          description: "The name/title of the card",
        },
        desc: {
          type: "string",
          description: "Optional description for the card",
        },
        due: {
          type: "string",
          description: "Optional due date in ISO 8601 format (e.g. 2025-12-31T23:59:00.000Z)",
        },
      },
      required: ["list_id", "name"],
    },
  },
  {
    name: "update_card",
    description: "Update an existing Trello card's name, description, or due date",
    inputSchema: {
      type: "object",
      properties: {
        card_id: {
          type: "string",
          description: "The ID of the card to update",
        },
        name: {
          type: "string",
          description: "New name for the card",
        },
        desc: {
          type: "string",
          description: "New description for the card",
        },
        due: {
          type: "string",
          description: "New due date in ISO 8601 format",
        },
      },
      required: ["card_id"],
    },
  },
  {
    name: "move_card",
    description: "Move a Trello card to a different list",
    inputSchema: {
      type: "object",
      properties: {
        card_id: {
          type: "string",
          description: "The ID of the card to move",
        },
        list_id: {
          type: "string",
          description: "The ID of the destination list",
        },
      },
      required: ["card_id", "list_id"],
    },
  },
  {
    name: "archive_card",
    description: "Archive (close) a Trello card",
    inputSchema: {
      type: "object",
      properties: {
        card_id: {
          type: "string",
          description: "The ID of the card to archive",
        },
      },
      required: ["card_id"],
    },
  },
  {
    name: "add_comment",
    description: "Add a comment to a Trello card",
    inputSchema: {
      type: "object",
      properties: {
        card_id: {
          type: "string",
          description: "The ID of the card to comment on",
        },
        text: {
          type: "string",
          description: "The comment text",
        },
      },
      required: ["card_id", "text"],
    },
  },
  {
    name: "create_list",
    description: "Create a new list on a Trello board",
    inputSchema: {
      type: "object",
      properties: {
        board_id: {
          type: "string",
          description: "The ID of the board to create the list on",
        },
        name: {
          type: "string",
          description: "The name of the new list",
        },
      },
      required: ["board_id", "name"],
    },
  },
];
