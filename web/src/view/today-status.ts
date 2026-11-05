/** 今日狀態的判斷（SRS FR-05、§4.4、D-05、D-31）。 */
import type { SeasonState } from '../api/types';

export type TodayStatus =
  | { kind: 'none' }
  | { kind: 'proposedNotExecuted' }
  | { kind: 'executed' }
  | { kind: 'endedEarlier'; endedDate: string };

export function todayStatus(
  state: Pick<SeasonState, 'today' | 'ended' | 'endedDate' | 'todayRecord'>,
): TodayStatus {
  // 已完結：一律依完結日顯示，今天的記錄不影響（D-31）
  if (state.ended && state.endedDate !== null) {
    return state.endedDate === state.today
      ? { kind: 'executed' }
      : { kind: 'endedEarlier', endedDate: state.endedDate };
  }
  const record = state.todayRecord;
  if (!record || !record.proposed) return { kind: 'none' };
  return record.executed ? { kind: 'executed' } : { kind: 'proposedNotExecuted' };
}
