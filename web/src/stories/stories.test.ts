import { describe, expect, it } from 'vitest';
import { fallbackSeasons } from '../season/fallback-seasons';
import { common } from './common';
import { getStory, stories } from './index';
import { season1 } from './season-1';
import { resolveStory, type SeasonStory } from './types';
import { API_ERROR_CODES } from '../api/error-codes';

function collectStrings(value: unknown, path = ''): Array<[string, string]> {
  if (typeof value === 'string') return [[path, value]];
  if (Array.isArray(value)) return value.flatMap((v, i) => collectStrings(v, `${path}[${i}]`));
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([k, v]) => collectStrings(v, path ? `${path}.${k}` : k));
  }
  return [];
}

describe('劇本設定檔', () => {
  it('stories 的 key 與劇本 id 一致', () => {
    for (const [id, story] of Object.entries(stories)) expect(story.id).toBe(id);
  });

  it('seasons.config.json 的每一季都有劇本', () => {
    for (const season of fallbackSeasons) expect(getStory(season.id)).toBeDefined();
  });

  it('找不到的季別回傳 undefined', () => {
    expect(getStory('no-such-season')).toBeUndefined();
    expect(getStory('toString')).toBeUndefined();
  });

  it('所有文字欄位都不是空字串', () => {
    for (const story of Object.values(stories)) {
      for (const [path, text] of collectStrings(story)) {
        expect(text.trim(), `${story.id}.${path}`).not.toBe('');
      }
    }
  });

  it('每個錯誤代碼都有文案', () => {
    for (const story of Object.values(stories)) {
      for (const code of API_ERROR_CODES) expect(story.errors[code]).toBeTruthy();
    }
  });

  it('季別可以覆寫共用文字與錯誤文案（D-17）', () => {
    const overridden: SeasonStory = {
      ...season1,
      common: { retry: 'R' },
      errors: { NOTE_TOO_LONG: 'N' },
    };
    const story = resolveStory(overridden, common);
    expect(story.common.retry).toBe('R');
    expect(story.common.logout).toBe(common.logout);
    expect(story.errors.NOTE_TOO_LONG).toBe('N');
    expect(story.errors.RECORD_NOT_FOUND).toBe(common.errors.RECORD_NOT_FOUND);
  });

  it('季別的錯誤文案優先於共用文案', () => {
    const story = resolveStory(season1, common);
    expect(story.errors.UNAUTHORIZED).toBe(season1.errors.UNAUTHORIZED);
  });
});
