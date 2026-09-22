import { Audio, AVPlaybackStatus } from "expo-av";

import { DEFAULT_FADE_MS, SECTION_MIX } from "@/constants/sections";
import {
  EngineState,
  InstrumentId,
  InstrumentMix,
  SectionId,
  SongConfig,
} from "@/types";

const INSTRUMENTS: InstrumentId[] = ["drums", "bass", "piano", "synth"];
const FADE_STEP_MS = 40;

type Listener = (state: EngineState) => void;

/**
 * 드럼/베이스/피아노/신디사이저 4개의 스템(stem) 트랙을 동시에 루프 재생하고,
 * Section(intro/verse/chorus/...) 전환 시 악기별 목표 볼륨으로 부드럽게
 * 크로스페이드하는 오디오 엔진.
 *
 * 정밀한 샘플 단위 동기화(phase-lock)는 네이티브 오디오 그래프가 필요해
 * expo-av 만으로는 한계가 있다. 이 MVP는 "다음 마디(bar) 경계"를 계산해
 * 그 시점에 볼륨 전환을 적용함으로써 체감상 박자에 맞춰 전환되도록 근사한다.
 *
 * 키(Key) 변경도 마찬가지로 true pitch-shift 가 아니라 재생속도(rate) 기반의
 * 근사치이며, 프로덕션에서는 전용 DSP 모듈(네이티브 pitch-shifter)로
 * 교체해야 한다. 자세한 내용은 리포지토리 루트 README 참고.
 */
export class AudioEngine {
  private song: SongConfig | null = null;
  private sounds: Partial<Record<InstrumentId, Audio.Sound>> = {};
  private fadeTimer: ReturnType<typeof setInterval> | null = null;
  private sectionChangeTimer: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Set<Listener>();

  private state: EngineState = {
    isLoaded: false,
    isPlaying: false,
    currentSection: "STOP",
    mix: SECTION_MIX.STOP,
    bpm: 0,
    keyOffsetSemitones: 0,
  };

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  private setState(patch: Partial<EngineState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l(this.state));
  }

  getState(): EngineState {
    return this.state;
  }

  async loadSong(song: SongConfig): Promise<void> {
    await this.unload();
    this.song = song;

    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: true,
      shouldDuckAndroid: false,
    });

    const entries = await Promise.all(
      INSTRUMENTS.map(async (id) => {
        const { sound } = await Audio.Sound.createAsync(song.tracks[id], {
          shouldPlay: false,
          isLooping: true,
          volume: 0,
        });
        return [id, sound] as const;
      })
    );
    this.sounds = Object.fromEntries(entries);

    this.setState({
      isLoaded: true,
      bpm: song.bpm,
      keyOffsetSemitones: 0,
      currentSection: "STOP",
      mix: SECTION_MIX.STOP,
    });
  }

  async unload(): Promise<void> {
    this.clearTimers();
    await Promise.all(
      Object.values(this.sounds).map((s) => s?.unloadAsync().catch(() => {}))
    );
    this.sounds = {};
    this.setState({ isLoaded: false, isPlaying: false });
  }

  /** 전 트랙을 볼륨 0으로 동시에 시작시킨다 (인트로에서 goToSection 으로 페이드인). */
  async playAll(): Promise<void> {
    await Promise.all(
      Object.values(this.sounds).map((s) => s?.playFromPositionAsync(0))
    );
    this.setState({ isPlaying: true });
  }

  async stopAll(): Promise<void> {
    this.clearTimers();
    await Promise.all(Object.values(this.sounds).map((s) => s?.stopAsync()));
    this.setState({
      isPlaying: false,
      currentSection: "STOP",
      mix: SECTION_MIX.STOP,
    });
  }

  /** 다음 마디 경계까지 남은 시간(ms)을 계산한다. 위치 조회 실패 시 0. */
  private async msUntilNextBar(): Promise<number> {
    if (!this.song) return 0;
    const reference = this.sounds.drums ?? Object.values(this.sounds)[0];
    if (!reference) return 0;

    const status: AVPlaybackStatus = await reference.getStatusAsync();
    if (!status.isLoaded) return 0;

    const beatMs = 60000 / this.song.bpm;
    const barMs = beatMs * this.song.beatsPerBar;
    const posInBar = status.positionMillis % barMs;
    return barMs - posInBar;
  }

  /**
   * 지정한 섹션으로 전환한다. 다음 마디 경계까지 기다렸다가(quantize),
   * 각 악기 볼륨을 목표 믹스로 부드럽게 크로스페이드한다.
   */
  async goToSection(
    section: SectionId,
    opts: { fadeMs?: number; quantize?: boolean } = {}
  ): Promise<void> {
    if (!this.state.isLoaded) return;
    const fadeMs = opts.fadeMs ?? DEFAULT_FADE_MS;
    const quantize = opts.quantize ?? true;

    if (this.sectionChangeTimer) clearTimeout(this.sectionChangeTimer);

    const delay = quantize ? await this.msUntilNextBar() : 0;
    this.sectionChangeTimer = setTimeout(() => {
      this.applyMix(SECTION_MIX[section], fadeMs);
      this.setState({ currentSection: section });
    }, delay);
  }

  /** 인도자가 "다같이 크게!" 라고 외칠 때 즉시 풀밴드(전 악기 최대)로 전환. 즉시성이 중요하므로 quantize 하지 않는다. */
  async triggerFullBand(fadeMs = 400): Promise<void> {
    this.applyMix(SECTION_MIX.CHORUS, fadeMs);
    this.setState({ currentSection: "CHORUS" });
  }

  /** rate 기반 근사 키 변경. shouldCorrectPitch=false 이므로 템포도 함께 변한다 (MVP 한계, README 참고). */
  async shiftKey(deltaSemitones: number): Promise<void> {
    const nextOffset = this.state.keyOffsetSemitones + deltaSemitones;
    const rate = Math.pow(2, nextOffset / 12);

    await Promise.all(
      Object.values(this.sounds).map((s) =>
        s?.setStatusAsync({ rate, shouldCorrectPitch: false })
      )
    );
    this.setState({ keyOffsetSemitones: nextOffset });
  }

  /** 각 악기의 현재 볼륨에서 목표 볼륨까지 매 FADE_STEP_MS 마다 선형 보간한다. */
  private applyMix(targetMix: InstrumentMix, durationMs: number) {
    if (this.fadeTimer) clearInterval(this.fadeTimer);

    const startMix = { ...this.state.mix };
    const steps = Math.max(1, Math.round(durationMs / FADE_STEP_MS));
    let step = 0;

    this.fadeTimer = setInterval(() => {
      step += 1;
      const t = Math.min(1, step / steps);
      const nextMix = {} as InstrumentMix;

      INSTRUMENTS.forEach((id) => {
        const from = startMix[id];
        const to = targetMix[id];
        const value = from + (to - from) * t;
        nextMix[id] = value;
        this.sounds[id]?.setVolumeAsync(value).catch(() => {});
      });

      this.setState({ mix: nextMix });

      if (t >= 1 && this.fadeTimer) {
        clearInterval(this.fadeTimer);
        this.fadeTimer = null;
      }
    }, FADE_STEP_MS);
  }

  private clearTimers() {
    if (this.fadeTimer) clearInterval(this.fadeTimer);
    if (this.sectionChangeTimer) clearTimeout(this.sectionChangeTimer);
    this.fadeTimer = null;
    this.sectionChangeTimer = null;
  }
}
