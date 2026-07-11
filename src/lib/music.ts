/**
 * ChuckyEngine — plays a looping background music track via Web Audio API
 * (AudioBufferSourceNode with loop=true for sample-accurate, gapless looping)
 * and synthesises short stings / blips via oscillators.
 *
 * Why not HTMLAudioElement?  Browsers insert a 20–100 ms silence between
 * loop iterations with `<audio loop>`.  AudioBufferSourceNode.loop is
 * sample-accurate — zero gap.
 */

function midiToFreq(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12)
}

export class ChuckyEngine {
  private ctx: AudioContext | null = null
  private musicGain: GainNode | null = null
  private sfxGain: GainNode | null = null
  private source: AudioBufferSourceNode | null = null
  private buffer: AudioBuffer | null = null
  private playing = false
  private volume = 0.5
  private initialized = false

  // ── Beat system ──────────────────────────────────────────────────────────
  private beatTimer: ReturnType<typeof setTimeout> | null = null
  private beatStartTime = 0
  // Start at 100 BPM, speed up to 200 BPM over ~5 minutes
  private static readonly BPM_START = 100
  private static readonly BPM_MAX = 200
  private static readonly BPM_ACCEL = 3 // +1 BPM every 3 seconds

  /** Call from a user gesture (click) to satisfy autoplay policies. */
  async init() {
    if (this.initialized) return
    this.initialized = true

    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext
    this.ctx = new Ctx()

    // Two gain paths: music (loops) and sfx (one-shots)
    this.musicGain = this.ctx.createGain()
    this.musicGain.gain.value = this.volume
    this.musicGain.connect(this.ctx.destination)

    this.sfxGain = this.ctx.createGain()
    this.sfxGain.gain.value = this.volume * 0.3
    this.sfxGain.connect(this.ctx.destination)

    // Pre-fetch and decode the music file into an AudioBuffer
    this.buffer = await this.loadBuffer('/music.ogg')
  }

  private async loadBuffer(url: string): Promise<AudioBuffer> {
    const resp = await fetch(url)
    const arrayBuf = await resp.arrayBuffer()
    if (!this.ctx) throw new Error('AudioContext not ready')
    return this.ctx.decodeAudioData(arrayBuf)
  }

  get isPlaying() {
    return this.playing
  }

  /** Set master volume (0..1). Applied live. */
  setVolume(v: number) {
    const clamped = Math.max(0, Math.min(1, v))
    this.volume = clamped
    if (this.musicGain) {
      const now = this.ctx!.currentTime
      this.musicGain.gain.cancelScheduledValues(now)
      this.musicGain.gain.setValueAtTime(this.musicGain.gain.value, now)
      this.musicGain.gain.exponentialRampToValueAtTime(Math.max(0.0001, clamped), now + 0.05)
    }
    if (this.sfxGain) this.sfxGain.gain.value = clamped * 0.3
  }

  get currentVolume() {
    return this.volume
  }

  async start() {
    if (!this.buffer) await this.init()
    if (!this.ctx || !this.buffer || !this.musicGain || this.playing) return
    if (this.ctx.state === 'suspended') await this.ctx.resume()

    this.playing = true

    // Create a new source each time (they're single-use)
    this.source = this.ctx.createBufferSource()
    this.source.buffer = this.buffer
    this.source.loop = true
    this.source.connect(this.musicGain)
    this.source.start(0)

    // Start the beat system (kick drum + tempo tracking)
    this.startBeats()
  }

  /** Abruptly stop the music (the FREEZE moment). */
  stop() {
    if (!this.source || !this.playing) return
    this.playing = false
    try {
      this.source.stop()
    } catch { /* already stopped */ }
    this.source = null
    this.stopBeats()
  }

  // ── Beat system ──────────────────────────────────────────────────────────

  /** Current beat interval in ms, based on elapsed time since music started. */
  getBeatInterval(): number {
    if (!this.beatStartTime) return 600 // 100 BPM default
    const elapsedSec = (performance.now() - this.beatStartTime) / 1000
    const bpm = Math.min(
      ChuckyEngine.BPM_MAX,
      ChuckyEngine.BPM_START + elapsedSec / ChuckyEngine.BPM_ACCEL
    )
    return 60000 / bpm
  }

  /** Current BPM, for display purposes. */
  getBPM(): number {
    return Math.round(60000 / this.getBeatInterval())
  }

  private startBeats() {
    this.beatStartTime = performance.now()
    this.scheduleBeat()
  }

  private stopBeats() {
    if (this.beatTimer) {
      clearTimeout(this.beatTimer)
      this.beatTimer = null
    }
    this.beatStartTime = 0
  }

  private scheduleBeat() {
    if (!this.playing) return
    this.kickDrum()
    const interval = this.getBeatInterval()
    this.beatTimer = setTimeout(() => this.scheduleBeat(), interval)
  }

  /** Synthesize a kick drum hit. */
  private kickDrum() {
    if (!this.ctx || !this.sfxGain) return
    const t = this.ctx.currentTime
    const osc = this.ctx.createOscillator()
    const gain = this.ctx.createGain()

    // Pitch sweep from 150Hz down to 50Hz for a kick drum effect
    osc.frequency.setValueAtTime(150, t)
    osc.frequency.exponentialRampToValueAtTime(50, t + 0.08)

    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.exponentialRampToValueAtTime(0.4 * this.volume, t + 0.005)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.15)

    osc.connect(gain)
    gain.connect(this.sfxGain)
    osc.start(t)
    osc.stop(t + 0.2)
  }

  private sfxNote(freq: number, time: number, dur: number, type: OscillatorType, vol: number) {
    if (!this.ctx || !this.sfxGain) return
    const osc = this.ctx.createOscillator()
    const gain = this.ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, time)
    osc.detune.setValueAtTime((Math.random() - 0.5) * 12, time)
    gain.gain.setValueAtTime(0.0001, time)
    gain.gain.exponentialRampToValueAtTime(vol, time + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, time + dur)
    osc.connect(gain)
    gain.connect(this.sfxGain)
    osc.start(time)
    osc.stop(time + dur + 0.05)
  }

  /** A short sting played on success / fail. */
  sting(type: 'fail' | 'success') {
    if (!this.ctx || !this.sfxGain) return
    const t = this.ctx.currentTime
    if (type === 'fail') {
      this.sfxNote(midiToFreq(58), t, 0.6, 'sawtooth', 0.2)
      this.sfxNote(midiToFreq(55), t + 0.05, 0.7, 'square', 0.15)
      this.sfxNote(midiToFreq(52), t + 0.12, 0.9, 'sawtooth', 0.18)
    } else {
      this.sfxNote(midiToFreq(72), t, 0.18, 'triangle', 0.18)
      this.sfxNote(midiToFreq(76), t + 0.1, 0.18, 'triangle', 0.18)
      this.sfxNote(midiToFreq(79), t + 0.2, 0.3, 'triangle', 0.2)
    }
  }

  /** Short UI click/blip for button presses. */
  blip(type: 'click' | 'toggle' | 'achievement' = 'click') {
    if (!this.ctx || !this.sfxGain) return
    const t = this.ctx.currentTime
    if (type === 'click') {
      this.sfxNote(midiToFreq(84), t, 0.06, 'square', 0.08 * this.volume)
    } else if (type === 'toggle') {
      this.sfxNote(midiToFreq(76), t, 0.05, 'sine', 0.1 * this.volume)
      this.sfxNote(midiToFreq(81), t + 0.04, 0.06, 'sine', 0.1 * this.volume)
    } else if (type === 'achievement') {
      this.sfxNote(midiToFreq(76), t, 0.1, 'triangle', 0.15 * this.volume)
      this.sfxNote(midiToFreq(81), t + 0.08, 0.1, 'triangle', 0.15 * this.volume)
      this.sfxNote(midiToFreq(86), t + 0.16, 0.1, 'triangle', 0.15 * this.volume)
      this.sfxNote(midiToFreq(93), t + 0.24, 0.18, 'triangle', 0.18 * this.volume)
    }
  }

  dispose() {
    this.stop()
    this.stopBeats()
    if (this.ctx) {
      this.ctx.close().catch(() => {})
      this.ctx = null
    }
    this.musicGain = null
    this.sfxGain = null
    this.buffer = null
    this.source = null
    this.initialized = false
  }
}