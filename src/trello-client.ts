const TRELLO_API_BASE = "https://api.trello.com/1";

export interface TrelloBoard {
  id: string;
  name: string;
  desc: string;
  url: string;
  closed: boolean;
}

export interface TrelloList {
  id: string;
  name: string;
  closed: boolean;
  idBoard: string;
}

export interface TrelloCard {
  id: string;
  name: string;
  desc: string;
  url: string;
  idList: string;
  idBoard: string;
  closed: boolean;
  due: string | null;
  labels: Array<{ id: string; name: string; color: string }>;
}

export interface TrelloComment {
  id: string;
  data: { text: string };
  date: string;
  memberCreator: { fullName: string; username: string };
}

export class TrelloClient {
  private apiKey: string;
  private token: string;

  constructor(apiKey: string, token: string) {
    this.apiKey = apiKey;
    this.token = token;
  }

  private async request<T>(
    method: string,
    path: string,
    params: Record<string, string> = {},
    body?: Record<string, unknown>
  ): Promise<T> {
    const url = new URL(`${TRELLO_API_BASE}${path}`);
    url.searchParams.set("key", this.apiKey);
    url.searchParams.set("token", this.token);
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }

    const options: RequestInit = { method };
    if (body) {
      options.headers = { "Content-Type": "application/json" };
      options.body = JSON.stringify(body);
    }

    const res = await fetch(url.toString(), options);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Trello API error ${res.status}: ${text}`);
    }
    return res.json() as Promise<T>;
  }

  async getBoards(): Promise<TrelloBoard[]> {
    return this.request<TrelloBoard[]>("GET", "/members/me/boards", {
      filter: "open",
      fields: "id,name,desc,url,closed",
    });
  }

  async getLists(boardId: string): Promise<TrelloList[]> {
    return this.request<TrelloList[]>("GET", `/boards/${boardId}/lists`, {
      filter: "open",
    });
  }

  async getCards(boardId: string): Promise<TrelloCard[]> {
    return this.request<TrelloCard[]>("GET", `/boards/${boardId}/cards`, {
      filter: "open",
      fields: "id,name,desc,url,idList,idBoard,closed,due,labels",
    });
  }

  async getCardsByList(listId: string): Promise<TrelloCard[]> {
    return this.request<TrelloCard[]>("GET", `/lists/${listId}/cards`, {
      fields: "id,name,desc,url,idList,idBoard,closed,due,labels",
    });
  }

  async createCard(params: {
    listId: string;
    name: string;
    desc?: string;
    due?: string;
  }): Promise<TrelloCard> {
    const body: Record<string, unknown> = {
      idList: params.listId,
      name: params.name,
    };
    if (params.desc) body.desc = params.desc;
    if (params.due) body.due = params.due;
    return this.request<TrelloCard>("POST", "/cards", {}, body);
  }

  async updateCard(
    cardId: string,
    updates: {
      name?: string;
      desc?: string;
      due?: string;
      closed?: boolean;
    }
  ): Promise<TrelloCard> {
    return this.request<TrelloCard>(
      "PUT",
      `/cards/${cardId}`,
      {},
      updates as Record<string, unknown>
    );
  }

  async moveCard(cardId: string, listId: string): Promise<TrelloCard> {
    return this.request<TrelloCard>(
      "PUT",
      `/cards/${cardId}`,
      {},
      { idList: listId }
    );
  }

  async archiveCard(cardId: string): Promise<TrelloCard> {
    return this.request<TrelloCard>(
      "PUT",
      `/cards/${cardId}`,
      {},
      { closed: true }
    );
  }

  async addComment(cardId: string, text: string): Promise<TrelloComment> {
    return this.request<TrelloComment>(
      "POST",
      `/cards/${cardId}/actions/comments`,
      {},
      { text }
    );
  }

  async createList(boardId: string, name: string): Promise<TrelloList> {
    return this.request<TrelloList>("POST", "/lists", {}, { idBoard: boardId, name });
  }
}
