# Passage Database — Design Spec

## Overview

Replace the current 10 hardcoded passages with ~40+ passages organized into three categories. Add a category selector to the welcome screen. No new dependencies — the "database" is a structured TypeScript data file.

## 1. Categories

```typescript
type PassageCategory = 'sentences' | 'pop-culture' | 'random-words';
```

- **sentences** — coherent prose on various topics (nature, technology, philosophy, science, etc.). The current 10 passages move here.
- **pop-culture** — movie quotes, song lyrics, video game references, famous internet phrases. Recognizable and fun to type.
- **random-words** — common English words with no semantic connection, separated by spaces. Pure speed practice — no need to read ahead for meaning.

Each category has passages across easy/medium/hard difficulties (~10-15 per category, ~40 total).

## 2. Data Structure

Update `TextPassage` interface in `src/types/GameTypes.ts`:

```typescript
export type PassageCategory = 'sentences' | 'pop-culture' | 'random-words';

export interface TextPassage {
  id: string;
  title: string;
  text: string;
  difficulty: 'easy' | 'medium' | 'hard';
  category: PassageCategory;
}
```

The existing `category` field (currently freeform strings like "Nature", "Technology") is replaced with the three fixed categories.

## 3. Passage Selection

Update `getRandomPassage` to accept both filters:

```typescript
getRandomPassage(difficulty?: Difficulty, category?: PassageCategory): TextPassage
```

When both are provided, filter by both. When only one is provided, filter by that dimension. When neither, random from all.

The `getPassageByDifficulty` function is removed (superseded by the combined filter).

## 4. Welcome Screen

Add a category picker row — three buttons styled identically to the difficulty picker:

```
[ SENTENCES ]  [ POP CULTURE ]  [ RANDOM WORDS ]
```

Positioned between the hero title/streak and the difficulty picker. Selected category stored in localStorage via `storage.ts` (new key: `typerace-category`, default: `'sentences'`).

## 5. Multiplayer Server

Update `server/src/passages.ts` with the same expanded passage data. The `create` message gains an optional `category` field so room creators can pick what type of text everyone races on.

## 6. localStorage

New key: `typerace-category` → `PassageCategory`. Default: `'sentences'`.

Add `getCategory(): PassageCategory` and `setCategory(c: PassageCategory)` to `storage.ts`.
