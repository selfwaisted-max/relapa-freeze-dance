/**
 * ChuckyEngine — a procedural Web Audio "creepy music box" engine.
 * Generates an eerie, playful minor-key tune reminiscent of a horror-doll
 * theme, entirely synthesized (no copyrighted audio used).
 *
 * Used by the Freeze-Dance game. The engine exposes start()/stop() so the
 * game can abruptly cut the music for the "FREEZE!" mechanic.
 */

type Voice = {
  osc: OscillatorNode
  gain: GainNode
}

const MELODY: number[] = [
  // A minor pentatonic-ish creepy motif (MIDI note numbers)
  69, 72, 76, 72, 74, 72, 69, 67,
  69, 72, 76, 79, 76, 72, 74, 72,
  67, 71, 74, 71, 72, 74, 76, 79,
  76, 74, 72, 69, 67, 69, 64, 67,
]

const BASS: number[] = [
  45, 45, 40, 40, 43, 43, 38, 38,
]

function midiToFreq(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12)
}

export class ChuckyEngine {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private melodyTimer: ReturnType<typeof setInterval> | null = null
  private bassTimer: ReturnType<typeof setInterval> | null = null
  private tickTimer: ReturnType<typeof setInterval> | null = null
  private step = 0
  private bassStep = 0
  private playing = false
  private reverb: ConvolverNode | null = null

  /** Call from a user gesture (click) to satisfy autoplay policies. */
  async init() {
    if (this.ctx) return
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext
    this.ctx = new Ctx()
    this.master = this.ctx.createGain()
    this.master.gain.value = 0.0001

    // Simple algorithmic reverb for a spooky tail
    this.reverb = this.ctx.createConvolver()
    this.reverb.buffer = this.makeImpulse(2.2, 2.5)
    const reverbGain = this.ctx.createGain()
    reverbGain.gain.value = 0.32
    this.master.connect(this.reverb)
    this.reverb.connect(reverbGain)
    reverbGain.connect(this.ctx.destination)
    this.master.connect(this.ctx.destination)
  }

  private makeImpulse(duration: number, decay: number): AudioBuffer {
    const ctx = this.ctx!
    const rate = ctx.sampleRate
    const len = Math.floor(rate * duration)
    const buf = ctx.createBuffer(2, len, rate)
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch)
      for (let i = 0; i < len; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay)
      }
    }
    return buf
  }

  private note(freq: number, time: number, dur: number, type: OscillatorType, vol: number) {
    if (!this.ctx || !this.master) return
    const osc = this.ctx.createOscillator()
    const gain = this.ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, time)
    // slight detune wobble for creepiness
    osc.detune.setValueAtTime((Math.random() - 0.5) * 12, time)

    gain.gain.setValueAtTime(0.0001, time)
    gain.gain.exponentialRampToValueAtTime(vol, time + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, time + dur)

    osc.connect(gain)
    gain.connect(this.master)
    osc.start(time)
    osc.stop(time + dur + 0.05)
  }

  private scheduleMelody() {
    if (!this.ctx) return
    const t = this.ctx.currentTime
    const noteIdx = MELODY[this.step % MELODY.length]
    const freq = midiToFreq(noteIdx)
    // music-box / calliope timbre: triangle + detuned sine
    this.note(freq, t, 0.34, 'triangle', 0.18)
    this.note(freq * 2.001, t + 0.01, 0.3, 'sine', 0.06)
    // occasional dissonant harmony
    if (this.step % 4 === 2) {
      this.note(midiToFreq(noteIdx + 1) * 0.5, t, 0.34, 'sawtooth', 0.04)
    }
    this.step++
  }

  private scheduleBass() {
    if (!this.ctx) return
    const t = this.ctx.currentTime
    const noteIdx = BASS[this.bassStep % BASS.length]
    const freq = midiToFreq(noteIdx)
    this.note(freq, t, 0.9, 'sawtooth', 0.12)
    this.note(freq / 2, t, 0.9, 'sine', 0.08)
    this.bassStep++
  }

  private scheduleTick() {
    if (!this.ctx) return
    const t = this.ctx.currentTime
    // soft ticking / heartbeat for unease
    this.note(220, t, 0.05, 'square', 0.03)
  }

  get isPlaying() {
    return this.playing
  }

  private volume = 0.5

  /** Set master volume (0..1). Applied live to the master gain node. */
  setVolume(v: number) {
    const clamped = Math.max(0, Math.min(1, v))
    this.volume = clamped
    if (this.ctx && this.master && this.playing) {
      const now = this.ctx.currentTime
      this.master.gain.cancelScheduledValues(now)
      this.master.gain.setValueAtTime(this.master.gain.value, now)
      this.master.gain.exponentialRampToValueAtTime(
        Math.max(0.0001, clamped),
        now + 0.1
      )
    }
  }

  get currentVolume() {
    return this.volume
  }

  async start() {
    if (!this.ctx) await this.init()
    if (!this.ctx || this.playing) return
    if (this.ctx.state === 'suspended') await this.ctx.resume()
    this.playing = true
    this.step = 0
    this.bassStep = 0
    // fade in
    const now = this.ctx.currentTime
    this.master!.gain.cancelScheduledValues(now)
    this.master!.gain.setValueAtTime(0.0001, now)
    this.master!.gain.exponentialRampToValueAtTime(
      Math.max(0.0001, this.volume),
      now + 0.3
    )

    this.scheduleMelody()
    this.melodyTimer = setInterval(() => this.scheduleMelody(), 250)
    this.scheduleBass()
    this.bassTimer = setInterval(() => this.scheduleBass(), 1000)
    this.tickTimer = setInterval(() => this.scheduleTick(), 500)
  }

  /** Abruptly stop the music (the FREEZE moment). */
  stop() {
    if (!this.ctx || !this.playing) return
    this.playing = false
    if (this.melodyTimer) clearInterval(this.melodyTimer)
    if (this.bassTimer) clearInterval(this.bassTimer)
    if (this.tickTimer) clearInterval(this.tickTimer)
    this.melodyTimer = null
    this.bassTimer = null
    this.tickTimer = null
    const now = this.ctx.currentTime
    // very quick cut
    this.master!.gain.cancelScheduledValues(now)
    this.master!.gain.setValueAtTime(this.master!.gain.value, now)
    this.master!.gain.exponentialRampToValueAtTime(0.0001, now + 0.08)
  }

  /** A short unsettling sting played on game over. */
  sting(type: 'fail' | 'success') {
    if (!this.ctx || !this.master) return
    const t = this.ctx.currentTime
    if (type === 'fail') {
      this.note(midiToFreq(58), t, 0.6, 'sawtooth', 0.2)
      this.note(midiToFreq(55), t + 0.05, 0.7, 'square', 0.15)
      this.note(midiToFreq(52), t + 0.12, 0.9, 'sawtooth', 0.18)
    } else {
      this.note(midiToFreq(72), t, 0.18, 'triangle', 0.18)
      this.note(midiToFreq(76), t + 0.1, 0.18, 'triangle', 0.18)
      this.note(midiToFreq(79), t + 0.2, 0.3, 'triangle', 0.2)
    }
  }

  /** Short UI click/blip for button presses. */
  blip(type: 'click' | 'toggle' | 'achievement' = 'click') {
    if (!this.ctx || !this.master) return
    const t = this.ctx.currentTime
    if (type === 'click') {
      this.note(midiToFreq(84), t, 0.06, 'square', 0.08 * this.volume)
    } else if (type === 'toggle') {
      this.note(midiToFreq(76), t, 0.05, 'sine', 0.1 * this.volume)
      this.note(midiToFreq(81), t + 0.04, 0.06, 'sine', 0.1 * this.volume)
    } else if (type === 'achievement') {
      // sparkly ascending arpeggio
      this.note(midiToFreq(76), t, 0.1, 'triangle', 0.15 * this.volume)
      this.note(midiToFreq(81), t + 0.08, 0.1, 'triangle', 0.15 * this.volume)
      this.note(midiToFreq(86), t + 0.16, 0.1, 'triangle', 0.15 * this.volume)
      this.note(midiToFreq(93), t + 0.24, 0.18, 'triangle', 0.18 * this.volume)
    }
  }

  dispose() {
    this.stop()
    if (this.ctx) {
      this.ctx.close().catch(() => {})
      this.ctx = null
    }
  }
}
