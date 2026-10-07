import type { InventoryItem } from '../game'
import { supabase } from './supabase'

export interface DailyUpkeepResult {
  status: 'success' | 'company_not_found' | 'fee_account_not_found' | 'company_insufficient'
  inventory?: InventoryItem[]
  mana?: number
  balance?: number
}

export async function requestDailyUpkeep(): Promise<{ result: DailyUpkeepResult | null; message: string | null }> {
  try {
    if (!supabase) return { result: null, message: '광산 연결을 확인해 주세요.' }
    const { data, error } = await supabase.rpc('apply_daily_upkeep')
    if (error || !data) return { result: null, message: '자가 복원과 일일 보상을 처리하지 못했습니다. 연결이 복구된 뒤 게임으로 돌아오거나 새로고침하면 다시 시도합니다.' }
    const result = data as DailyUpkeepResult
    if (result.status === 'success') return { result, message: null }
    const message = result.status === 'company_insufficient'
      ? '일일 보상을 지급할 회사 포인트가 부족해 정비가 완료되지 않았습니다. 잠시 후 게임으로 돌아오면 다시 시도합니다.'
      : '일일 보상 정산 계정을 확인하지 못해 정비가 완료되지 않았습니다. 잠시 후 게임으로 돌아오면 다시 시도합니다.'
    return { result: null, message }
  } catch {
    return { result: null, message: '일일 정비 중 연결이 끊겼습니다. 연결이 복구된 뒤 게임으로 돌아오면 다시 시도합니다.' }
  }
}

// 한국 자정 직후 재확인하며 브라우저가 잠든 동안의 처리는 복귀 이벤트가 맡습니다.
export function nextDailyUpkeepDelay(now = Date.now()) {
  const koreaOffset = 9 * 60 * 60 * 1000
  const koreaNow = new Date(now + koreaOffset)
  const nextMidnight = Date.UTC(koreaNow.getUTCFullYear(), koreaNow.getUTCMonth(), koreaNow.getUTCDate() + 1) - koreaOffset
  return nextMidnight - now + 50
}
