/**
 * 型別測試：只參與 tsc 檢查，不會被打包。
 * 若少填欄位卻沒有編譯錯誤，@ts-expect-error 本身會讓 tsc 失敗（§3.3 規則 1、D-17）。
 */
import { common } from './common';
import { season1 } from './season-1';
import type { CommonText, SeasonStory } from './types';

const { title: _title, ...seasonWithoutTitle } = season1;
// @ts-expect-error 劇本少了必填欄位 title
const brokenSeason: SeasonStory = seasonWithoutTitle;

const { ending: _ending, ...seasonWithoutEnding } = season1;
// @ts-expect-error 劇本少了必填欄位 ending
const brokenEnding: SeasonStory = seasonWithoutEnding;

const { retry: _retry, ...commonWithoutRetry } = common;
// @ts-expect-error 共用文字少了必填欄位 retry
const brokenCommon: CommonText = commonWithoutRetry;

const { errors: _errors, ...commonWithoutErrors } = common;
// @ts-expect-error 共用文字少了錯誤代碼文案
const brokenErrors: CommonText = commonWithoutErrors;

export const typeTests = [
  _title,
  _ending,
  _retry,
  _errors,
  brokenSeason,
  brokenEnding,
  brokenCommon,
  brokenErrors,
];
