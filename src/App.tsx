import { useCallback, useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import './App.css'
import './Shop.css'
import { ChestOpeningEffect } from './components/ChestOpeningEffect'
import { GameScreen } from './components/GameScreen'
import { LoginScreen } from './components/LoginScreen'
import { Modal } from './components/Modal'
import { NicknameModal } from './components/NicknameModal'
import { findOre, type ChestId, type InventoryItem, type MineResult, type OpenChestResult, type OreId, type UserProfile } from './game'
import { isSupabaseConfigured, supabase } from './lib/supabase'

type Screen = 'loading' | 'login' | 'nickname' | 'game'

interface LinkResult {
  status: 'success' | 'already_linked' | 'not_found' | 'already_taken'
}

interface SellResult {
  status: 'success' | 'empty' | 'empty_selection' | 'company_not_found' | 'company_insufficient'
  sold_points?: number
  balance?: number
  inventory?: InventoryItem[]
}

interface RepairResult {
  status: 'success' | 'not_repairable' | 'no_damage' | 'invalid_amount' | 'insufficient_materials' | 'pickaxe_not_found'
  inventory?: InventoryItem[]
  repaired_amount?: number
  ore_id?: OreId
  required?: number
  available?: number
}

function App() {
  const [screen, setScreen] = useState<Screen>('loading')
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loginBusy, setLoginBusy] = useState(false)
  const [actionBusy, setActionBusy] = useState(false)
  const [mining, setMining] = useState(false)
  const [lastMine, setLastMine] = useState<MineResult | null>(null)
  const [openingReward, setOpeningReward] = useState<OpenChestResult | null>(null)
  const [nicknameError, setNicknameError] = useState('')
  const [notice, setNotice] = useState<{ title: string; message: string } | null>(null)

  const loadProfile = useCallback(async (user: User) => {
    if (!supabase) return
    const { data, error } = await supabase
      .from('users')
      .select('nickname, balance, inventory')
      .eq('auth_user_id', user.id)
      .maybeSingle()

    if (error) {
      setNotice({ title: '광산 연결 오류', message: '광부 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.' })
      setScreen('login')
      return
    }

    if (!data) {
      setProfile(null)
      setScreen('nickname')
      return
    }

    setProfile({
      nickname: String(data.nickname),
      balance: Number(data.balance ?? 0),
      inventory: Array.isArray(data.inventory) ? data.inventory as unknown as InventoryItem[] : [],
    })
    setScreen('game')
  }, [])

  useEffect(() => {
    if (!supabase) {
      setScreen('login')
      return
    }

    let active = true
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      const user = data.session?.user ?? null
      setCurrentUser(user)
      if (user) void loadProfile(user)
      else setScreen('login')
    })

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event !== 'SIGNED_IN' && event !== 'SIGNED_OUT') return
      const user = session?.user ?? null
      setCurrentUser(user)
      if (user) void loadProfile(user)
      else {
        setProfile(null)
        setScreen('login')
      }
    })

    return () => {
      active = false
      listener.subscription.unsubscribe()
    }
  }, [loadProfile])

  useEffect(() => {
    if (!lastMine) return

    const timeoutId = window.setTimeout(() => setLastMine(null), 900)
    return () => window.clearTimeout(timeoutId)
  }, [lastMine])

  const handleLogin = async () => {
    if (!supabase) {
      setNotice({
        title: '환경변수 설정 필요',
        message: 'Vercel에 SUPABASE_URL과 SUPABASE_KEY를 설정한 뒤 다시 배포해 주세요. SUPABASE_KEY에는 publishable key를 사용해야 합니다.',
      })
      return
    }
    setLoginBusy(true)
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'kakao', options: { redirectTo: window.location.origin } })
    if (error) {
      setNotice({ title: '로그인 실패', message: '카카오 로그인 페이지를 열지 못했습니다. 잠시 후 다시 시도해 주세요.' })
      setLoginBusy(false)
    }
  }

  const handleLogout = async () => {
    if (!supabase) return
    await supabase.auth.signOut()
    setCurrentUser(null)
    setProfile(null)
    setLastMine(null)
    setScreen('login')
  }

  const handleNickname = async (nickname: string) => {
    if (!supabase || !currentUser) return
    setNicknameError('')
    const { data, error } = await supabase.rpc('link_pointmine_account', { p_nickname: nickname })
    if (error) {
      setNicknameError('계정을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.')
      return
    }

    const result = data as unknown as LinkResult
    if (result.status === 'not_found') {
      setNicknameError('포인트 상점 계정이 존재하지 않습니다.')
      return
    }
    if (result.status === 'already_taken') {
      setNicknameError('이미 연동된 다른 카카오 계정이 있습니다.')
      return
    }
    await loadProfile(currentUser)
  }

  const handleMine = async () => {
    if (!supabase || mining) return
    setMining(true)
    const { data, error } = await supabase.rpc('mine_ore')
    if (error) {
      setNotice({ title: '채굴 실패', message: '광맥이 불안정합니다. 잠시 후 다시 시도해 주세요.' })
      setMining(false)
      return
    }
    const result = data as unknown as MineResult
    if (result.status === 'success' && result.inventory && profile) {
      setProfile({ ...profile, inventory: result.inventory })
      setLastMine(result)
    } else if (result.status === 'broken_pickaxe') {
      setNotice({ title: '곡괭이 파손', message: '장착한 곡괭이의 내구도가 모두 소진되었습니다.' })
    } else if (result.status === 'no_pickaxe') {
      setNotice({ title: '장비 필요', message: '인벤토리에서 사용할 곡괭이를 장착해 주세요.' })
    }
    setMining(false)
  }

  const handleEquip = async (pickaxeId: string) => {
    if (!supabase || actionBusy || !profile) return
    setActionBusy(true)
    const { data, error } = await supabase.rpc('equip_pickaxe', { p_pickaxe_id: pickaxeId })
    if (error) {
      setNotice({ title: '장착 실패', message: '곡괭이를 장착하지 못했습니다.' })
    } else {
      const result = data as unknown as { status: string; inventory?: InventoryItem[] }
      if (result.status === 'success' && result.inventory) setProfile({ ...profile, inventory: result.inventory })
    }
    setActionBusy(false)
  }

  const handleSell = async (oreIds: OreId[]) => {
    if (!supabase || actionBusy || !profile || oreIds.length === 0) return
    setActionBusy(true)
    const { data, error } = await supabase.rpc('sell_selected_minerals', { p_ore_ids: oreIds })
    if (error) {
      setNotice({ title: '판매 실패', message: '선택한 광물 거래를 완료하지 못했습니다. 추가 SQL 적용 여부를 확인해 주세요.' })
    } else {
      const result = data as unknown as SellResult
      if (result.status === 'success' && result.inventory && result.balance !== undefined) {
        setProfile({ ...profile, inventory: result.inventory, balance: result.balance })
        setNotice({ title: '판매 완료', message: `선택한 광물을 판매해 ${Number(result.sold_points).toLocaleString('ko-KR')}P를 획득했습니다.` })
      } else if (result.status === 'company_insufficient') {
        setNotice({ title: '판매 보류', message: '엘케이컴퍼니의 정산 잔액이 부족합니다.' })
      } else if (result.status === 'company_not_found') {
        setNotice({ title: '판매 보류', message: '엘케이컴퍼니 정산 계정을 찾을 수 없습니다.' })
      }
    }
    setActionBusy(false)
  }

  const handleRepair = async (pickaxeId: string, amount: number) => {
    if (!supabase || actionBusy || !profile || amount <= 0) return
    setActionBusy(true)
    const { data, error } = await supabase.rpc('repair_pickaxe', { p_pickaxe_id: pickaxeId, p_amount: amount })
    if (error) {
      setNotice({ title: '수리 실패', message: '곡괭이를 수리하지 못했습니다. 추가 SQL 적용 여부를 확인해 주세요.' })
    } else {
      const result = data as unknown as RepairResult
      if (result.status === 'success' && result.inventory) {
        setProfile({ ...profile, inventory: result.inventory })
        setNotice({ title: '수리 완료', message: `곡괭이 내구도를 ${result.repaired_amount}만큼 복구했습니다.` })
      } else if (result.status === 'insufficient_materials') {
        const oreName = findOre(result.ore_id ?? '')?.name ?? '광물'
        setNotice({ title: '재료 부족', message: `${oreName}이 부족합니다. 필요 ${result.required}, 보유 ${result.available}.` })
      } else if (result.status === 'not_repairable') {
        setNotice({ title: '수리 불가', message: '이 곡괭이는 수리할 수 없습니다.' })
      } else if (result.status === 'no_damage') {
        setNotice({ title: '수리 불필요', message: '이미 최대 내구도입니다.' })
      }
    }
    setActionBusy(false)
  }

  const handleOpenChest = async (chestId: ChestId) => {
    if (!supabase || actionBusy || !profile) return
    setActionBusy(true)
    const { data, error } = await supabase.rpc('open_pickaxe_chest', { p_chest_id: chestId })
    if (error) {
      setNotice({ title: '상점 연결 오류', message: '상자를 구매하지 못했습니다. 상점 SQL 적용 여부를 확인해 주세요.' })
      setActionBusy(false)
      return
    }

    const result = data as unknown as OpenChestResult
    if (result.status === 'success' && result.inventory && result.balance !== undefined) {
      setProfile({ ...profile, inventory: result.inventory, balance: result.balance })
      setOpeningReward(result)
    } else if (result.status === 'insufficient_balance') {
      setNotice({ title: '포인트 부족', message: '상자를 구매할 포인트가 부족합니다.' })
    } else if (result.status === 'company_not_found') {
      setNotice({ title: '구매 보류', message: '필요한 정산 계정을 찾을 수 없습니다.' })
    } else {
      setNotice({ title: '구매 실패', message: '존재하지 않는 상자입니다.' })
    }
    setActionBusy(false)
  }

  return (
    <div className="app-shell">
      {screen === 'loading' && <div className="loading-screen"><span>⛏</span><p>광산 문을 여는 중...</p></div>}
      {screen === 'login' && <LoginScreen onLogin={handleLogin} loading={loginBusy} />}
      {screen === 'nickname' && <><LoginScreen onLogin={() => undefined} loading={false} /><NicknameModal onSubmit={handleNickname} onLogout={handleLogout} error={nicknameError} /></>}
      {screen === 'game' && profile && (
        <GameScreen
          profile={profile}
          mining={mining}
          actionBusy={actionBusy}
          lastMine={lastMine}
          onMine={handleMine}
          onEquip={handleEquip}
          onSell={handleSell}
          onRepair={handleRepair}
          onOpenChest={handleOpenChest}
          onLogout={handleLogout}
        />
      )}
      {!isSupabaseConfigured && screen === 'login' && <div className="config-badge">개발 환경 · Supabase 연결 필요</div>}
      {notice && (
        <Modal title={notice.title} onClose={() => setNotice(null)} labelledBy="notice-modal-title">
          <div className="notice-content"><span aria-hidden="true">◆</span><p>{notice.message}</p><button className="ore-button ore-button--primary" type="button" onClick={() => setNotice(null)}>확인</button></div>
        </Modal>
      )}
      {openingReward && <ChestOpeningEffect result={openingReward} onClose={() => setOpeningReward(null)} />}
    </div>
  )
}

export default App
