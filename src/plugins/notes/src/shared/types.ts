export type Scope = "host" | "folder" | "global";

export const LIMITS = {
  title: 200,
  body: 200_000,
  tags: 20,
  tag: 40,
} as const;

/** A note without its body, for lists. */
export interface NoteSummary {
  uid: string;
  scope: Scope;
  hostId: number | null;
  folder: string | null;
  title: string;
  excerpt: string;
  tags: string[];
  pinned: boolean;
  mine: boolean;
  canEdit: boolean;
  updatedAt: string;
}

export interface Note extends NoteSummary {
  body: string;
}

export interface NoteInput {
  scope: Scope;
  hostId?: number | null;
  folder?: string | null;
  title: string;
  body: string;
  tags: string[];
  pinned: boolean;
}

export interface NoteQuery {
  scope: Scope;
  hostId?: number;
  folder?: string;
  q?: string;
}
