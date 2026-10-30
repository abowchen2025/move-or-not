/** 季別清單（前端）：seasonId → 劇本。新增一季時在這裡登記。 */
import { common } from './common';
import { season1 } from './season-1';
import { resolveStory, type SeasonStory, type StoryConfig } from './types';

const seasons: readonly SeasonStory[] = [season1];

export const stories: Readonly<Record<string, StoryConfig>> = Object.fromEntries(
  seasons.map((season) => [season.id, resolveStory(season, common)]),
);

export function getStory(seasonId: string): StoryConfig | undefined {
  return Object.hasOwn(stories, seasonId) ? stories[seasonId] : undefined;
}

export type { StoryConfig } from './types';
