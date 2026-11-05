import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { menuNote, normalizeNote } from './note';

interface NoteCase {
  name: string;
  input: string;
  expected: string;
  normalized?: string;
  codePoints?: number;
}

const cases = (
  JSON.parse(
    readFileSync(new URL('../../../testdata/note-cases.json', import.meta.url), 'utf-8'),
  ) as { cases: NoteCase[] }
).cases;

describe('D-09、D-28 備註規則（與後端共用 testdata/note-cases.json）', () => {
  it('案例表不是空的', () => {
    expect(cases.length).toBeGreaterThan(20);
  });

  it.each(cases)('$name', (c) => {
    const result = normalizeNote(c.input);
    if (c.expected === 'OK') {
      expect(result).toEqual({ ok: true, value: c.normalized });
      if (result.ok && c.codePoints !== undefined) {
        expect([...result.value].length).toBe(c.codePoints);
      }
    } else {
      expect(result).toEqual({ ok: false, code: c.expected });
    }
  });
});

describe('D-34 「提了」選單的備註', () => {
  it.each(['', ' ', '　', '  　 '])('只有空白（%j）時送出 null，保留原備註', (input) => {
    expect(menuNote(input)).toEqual({ ok: true, value: null });
  });

  it('U+FEFF 不算空白，不會被當成留空', () => {
    expect(menuNote('﻿')).toEqual({ ok: true, value: '﻿' });
  });

  it('一般文字去頭尾空白後送出', () => {
    expect(menuNote('  note  ')).toEqual({ ok: true, value: 'note' });
  });

  it('不合規則時回傳錯誤代碼，不送出', () => {
    expect(menuNote('a\nb')).toEqual({ ok: false, code: 'INVALID_REQUEST' });
    expect(menuNote('a'.repeat(101))).toEqual({ ok: false, code: 'NOTE_TOO_LONG' });
  });
});
