export type CharacterMode = "roleplay" | "guide";

/** A database-backed chat persona. Built-ins are shared; custom characters are private to their owner. */
export interface Character {
  id: string;
  ownerId: string | null;
  builtIn: boolean;
  name: string;
  avatar: string;
  tradition: string;
  title: string;
  description: string;
  greeting: string;
  traits: string[];
  instructions: string;
  modes: CharacterMode[];
  suggestedPrompts: string[];
  sourceNote?: string;
  createdAt: number;
  updatedAt: number;
}

export interface CharacterInput {
  name?: unknown;
  avatar?: unknown;
  tradition?: unknown;
  title?: unknown;
  description?: unknown;
  greeting?: unknown;
  traits?: unknown;
  instructions?: unknown;
  modes?: unknown;
  suggestedPrompts?: unknown;
  sourceNote?: unknown;
}
