const sounds = {
  click: ['ui-click.wav', 0.16],
  reward: ['reward.wav', 0.22],
  mineHit: ['mine-hit.wav', 0.26],
  attack: ['attack.wav', 0.2],
  facetHit: ['facet-hit.wav', 0.2],
  facetSuccess: ['facet-success.wav', 0.24],
  facetFailure: ['facet-failure.wav', 0.18],
  enchantCast: ['enchant-cast.wav', 0.22],
  enchantReveal: ['enchant-reveal.wav', 0.2],
} as const

type SoundName = keyof typeof sounds
const preferenceKey = 'pointmine-sound-enabled'
let enabled = true
let context: AudioContext | null = null
const buffers = new Map<SoundName, Promise<AudioBuffer>>()
const activeSources = new Set<AudioBufferSourceNode>()

export function getSoundEnabled() {
  try {
    enabled = window.localStorage.getItem(preferenceKey) !== 'false'
  } catch {
    // 저장소가 차단된 브라우저에서는 현재 세션의 설정을 사용합니다.
  }
  return enabled
}

export function setSoundEnabled(value: boolean) {
  enabled = value
  try {
    window.localStorage.setItem(preferenceKey, String(value))
  } catch {
    // 효과음 설정을 저장하지 못해도 게임 동작에는 영향을 주지 않습니다.
  }
  if (!value) {
    for (const source of activeSources) source.stop()
    activeSources.clear()
  }
}

export function playSound(name: SoundName) {
  if (!enabled || !window.AudioContext) return
  try {
    context ??= new AudioContext()
    const audioContext = context
    // 사용자 클릭 안에서 먼저 재개해 모바일 브라우저의 자동 재생 제한을 해제합니다.
    const ready = audioContext.state === 'running' ? Promise.resolve() : audioContext.resume()
    let buffer = buffers.get(name)
    if (!buffer) {
      buffer = fetch(`${import.meta.env.BASE_URL}audio/${sounds[name][0]}`)
        .then((response) => {
          if (!response.ok) throw new Error('효과음을 불러오지 못했습니다.')
          return response.arrayBuffer()
        })
        .then((data) => audioContext.decodeAudioData(data))
      buffers.set(name, buffer)
    }
    void Promise.all([ready, buffer]).then(([, decoded]) => {
      if (!enabled || audioContext.state !== 'running') return
      const source = audioContext.createBufferSource()
      const gain = audioContext.createGain()
      source.buffer = decoded
      gain.gain.value = sounds[name][1]
      source.connect(gain)
      gain.connect(audioContext.destination)
      source.onended = () => { activeSources.delete(source); source.disconnect(); gain.disconnect() }
      activeSources.add(source)
      source.start()
    }).catch(() => {
      buffers.delete(name)
    })
  } catch {
    // 오디오를 지원하지 않는 환경에서도 게임은 계속 이용할 수 있습니다.
  }
}
