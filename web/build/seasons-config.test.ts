import { describe, expect, it } from 'vitest';
import fallbackFromVirtualModule from 'virtual:seasons-config';
import { parseFallbackSeasons, readFallbackSeasons } from './seasons-config.ts';

const valid = { id: 'season-1', startDate: '2026-10-13', countInclusive: false };
const doc = (seasons: unknown) => JSON.stringify({ seasons });

describe('D-04 從 api/seasons.config.json 讀取退路設定', () => {
  it('讀取 repo 內的設定檔，只保留 id、startDate、countInclusive', () => {
    const seasons = readFallbackSeasons();
    expect(seasons[0]).toEqual(valid);
    for (const season of seasons) {
      expect(Object.keys(season).sort()).toEqual(['countInclusive', 'id', 'startDate']);
    }
  });

  it('虛擬模組的內容與設定檔一致', () => {
    expect(fallbackFromVirtualModule).toEqual(readFallbackSeasons());
  });

  it('接受多季並保留順序', () => {
    const seasons = parseFallbackSeasons(doc([valid, { ...valid, id: 'season-2' }]));
    expect(seasons.map((s) => s.id)).toEqual(['season-1', 'season-2']);
  });

  it.each([
    ['不是 JSON', '{oops'],
    ['seasons 為空', doc([])],
    ['缺少 seasons', JSON.stringify({})],
    ['id 含大寫', doc([{ ...valid, id: 'Season-1' }])],
    ['id 重複', doc([valid, valid])],
    ['日期格式錯誤', doc([{ ...valid, startDate: '2026/10/13' }])],
    ['不存在的日期', doc([{ ...valid, startDate: '2026-02-30' }])],
    ['countInclusive 為字串', doc([{ ...valid, countInclusive: 'false' }])],
    ['季別為 null', doc([null])],
  ])('拒絕不合法的設定：%s', (_label, text) => {
    expect(() => parseFallbackSeasons(text)).toThrow();
  });
});
