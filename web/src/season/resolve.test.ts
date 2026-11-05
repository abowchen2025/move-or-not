import { describe, expect, it } from 'vitest';
import { chooseSeason, requestedSeason, urlWithoutSeasonParam } from './resolve';

const ONE = ['season-1'];
const TWO = ['season-1', 'season-2'];

describe('季別解析（§3.3 規則 3、D-22-l、D-32）', () => {
  it('沒有 ?season= 時用最新一季（清單最後一筆）', () => {
    expect(chooseSeason(null, ONE)).toEqual({ seasonId: 'season-1', dropParam: false });
    expect(chooseSeason(null, TWO)).toEqual({ seasonId: 'season-2', dropParam: false });
  });

  it('?season= 有效時用它', () => {
    expect(chooseSeason('season-1', TWO)).toEqual({ seasonId: 'season-1', dropParam: false });
  });

  it('?season= 無效時用最新一季，並移除參數', () => {
    expect(chooseSeason('season-9', TWO)).toEqual({ seasonId: 'season-2', dropParam: true });
    expect(chooseSeason('', ONE)).toEqual({ seasonId: 'season-1', dropParam: true });
  });

  it('清單為空時丟出錯誤', () => {
    expect(() => chooseSeason(null, [])).toThrow();
  });

  it('讀取網址參數', () => {
    expect(requestedSeason('?season=season-1&x=1')).toBe('season-1');
    expect(requestedSeason('?x=1')).toBeNull();
    expect(requestedSeason('')).toBeNull();
  });

  it('移除 ?season= 時保留其他參數與 hash', () => {
    expect(urlWithoutSeasonParam('https://example.test/move-or-not/?season=nope&x=1#replay')).toBe(
      '/move-or-not/?x=1#replay',
    );
    expect(urlWithoutSeasonParam('https://example.test/move-or-not/?season=nope')).toBe(
      '/move-or-not/',
    );
  });
});
