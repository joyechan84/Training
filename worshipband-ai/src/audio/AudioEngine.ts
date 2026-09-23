import { Audio, AVPlaybackStatus } from "expo-av";

import { DEFAULT_FADE_MS, SECTION_MIX } from "@/constants/sections";
import {
  EngineState,
  InstrumentId,
  InstrumentMix,
  SectionId,
  SongConfig,
} from "@/types";

const INSTRUMENTS: InstrumentId[] = ["drums", "bass", "guitar", "piano", "synth"];
const FADE_STEP_MS = 40;
/** timeline 모드(실제 원곡 seek)에서 쓰는 짧은 페이드. 점프 컷을 부드럽게 가려준다. */
const TIMELINE_FADE_MS = 400;

type Listener = (state: EngineState) => void;

/**
 * 드럼/베이스/일렉기타/피아노/신디사이저 5개의 스템(stem) 트랙을 동시 재생하고,
 * Section(intro/verse/chorus/solo/...) 전환 시 악기별 목표 볼륨으로 부드럽게
 * 크로스페이드하는 오디오 엔진. 곡의 mode(loop/timeline)에 따라 전환 방식이 다르다 — 자세한
 * 내용은 goToSection/goToTimelineSection 주석과 리포지토리 루트 README 참고.
 *
 * 정밀한 샘플 단위 동기화(phase-lock)는 네이티브 오디오 그래프가 필요해
 * expo-av 만으로는 한계가 있다. loop 모드는 "다음 마디(bar) 경계"를 계산해
 * 그 시점에 볼륨 전환을 적용함으로써 체감상 박자에 맞춰 전환되도록 근사한다.
 *
 * 키(Key) 변경도 마찬가지로 true pitch-shift 가 아니라 재생속도(rate) 기반의
 * 근사치이며, 프로덕션에서는 전용 DSP 모듈(네이티브 pitch-shifter)로
 * 교체해야 한다.
 */
export class AudioEngine {
  private song: SongConfig | null = null;
  private sounds: Partial<Record<InstrumentId, Audio.Sound>> = {};
  private fadeTimer: ReturnType<typeof setInterval> | null = null;
  private sectionChangeTimer: ReturnType<typeof setTimeout> | null = null;
  /** timeline 모드에서 "말 없이도" 학습된 구간마다 자동으로 믹스를 바꿔주는 예약 타이머들. */
  private autoFollowTimers: ReturnType<typeof setTimeout>[] = [];
  private listeners = new Set<Listener>();

  private state: EngineState = {
    isLoaded: false,
    isPlaying: false,
    currentSection: "STOP",
    mix: SECTION_MIX.STOP,
    bpm: 0,
    keyOffsetSemitones: 0,
    autoFollowEnabled: true,
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

    // loop 모드: 곡 전체가 몇 초짜리 루프라 반복 재생.
    // timeline 모드: 유튜브에서 학습된 풀렝스 원곡 스템이라 끝까지 자연스럽게 흘러가게 두고,
    // 섹션 이동은 goToSection 에서의 seek 로 처리한다.
    const shouldLoop = song.mode === "loop";
    const entries = await Promise.all(
      INSTRUMENTS.map(async (id) => {
        const { sound } = await Audio.Sound.createAsync(song.tracks[id], {
          shouldPlay: false,
          isLooping: shouldLoop,
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
      autoFollowEnabled: true,
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

  /**
   * 전 트랙을 재생 시작한다. 이후 goToSection 이 목표 믹스로 페이드인하는데,
   * "볼륨 0으로 재생 시작 → 한참 뒤 setInterval 로 볼륨을 처음 올림" 순서로
   * 하면 웹 브라우저에서 그 첫 볼륨 변경이 완전히 무음 처리되는 걸 실제로
   * 확인했다 (사용자 탭과 무관한 타이머가 "처음으로 음소거를 해제"하는 걸
   * 자동재생 정책이 막는 것으로 보임 — 브라우저 Web Audio API로 만든 별도
   * 테스트 톤은 정상적으로 들렸으므로, 이 페이지에서 오디오 자체가 막힌 게
   * 아니라 이 순서 문제였다). 그래서 재생 시작과 "들릴랑 말랑한" 최소 볼륨
   * 설정을 같은 상태 업데이트(같은 사용자 탭에서 이어지는 호출 체인, 타이머
   * 개입 없음)로 함께 보낸다 — 이후의 setInterval 기반 페이드는 이미
   * "음소거 해제된" 상태에서 이어가는 것이라 문제없다.
   */
  async playAll(): Promise<void> {
    const AUDIBLE_FLOOR = 0.12;
    await Promise.all(
      Object.values(this.sounds).map((s) =>
        s?.setStatusAsync({
          positionMillis: 0,
          shouldPlay: true,
          volume: AUDIBLE_FLOOR,
        })
      )
    );
    const floorMix = INSTRUMENTS.reduce((mix, id) => {
      mix[id] = AUDIBLE_FLOOR;
      return mix;
    }, {} as InstrumentMix);
    this.setState({ isPlaying: true, mix: floorMix });

    if (this.song?.mode === "timeline") {
      this.scheduleAutoFollow(0);
    }
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

  /** 기준 트랙(드럼, 없으면 아무 트랙)의 현재 재생 위치(ms)를 읽는다. 조회 실패 시 0. */
  private async getReferencePositionMs(): Promise<number> {
    const reference = this.sounds.drums ?? Object.values(this.sounds)[0];
    if (!reference) return 0;
    const status: AVPlaybackStatus = await reference.getStatusAsync();
    return status.isLoaded ? status.positionMillis : 0;
  }

  /** 다음 마디 경계까지 남은 시간(ms)을 계산한다. 위치 조회 실패 시 0. */
  private async msUntilNextBar(): Promise<number> {
    if (!this.song) return 0;
    const posMs = await this.getReferencePositionMs();

    const beatMs = 60000 / this.song.bpm;
    const barMs = beatMs * this.song.beatsPerBar;
    const posInBar = posMs % barMs;
    return barMs - posInBar;
  }

  /**
   * 지정한 섹션으로 전환한다.
   * - loop 모드: 다음 마디 경계까지 기다렸다가(quantize) 악기 볼륨만 목표 믹스로 크로스페이드.
   * - timeline 모드: 학습된 타임라인에서 해당 섹션의 원곡 타임스탬프를 찾아 전 트랙을
   *   동시에 그 지점으로 seek 한 뒤(원곡 그대로의 연주 재현, 기타 솔로 포함) 믹스를 전환한다.
   */
  async goToSection(
    section: SectionId,
    opts: { fadeMs?: number; quantize?: boolean } = {}
  ): Promise<void> {
    if (!this.state.isLoaded || !this.song) return;

    if (this.song.mode === "timeline") {
      return this.goToTimelineSection(section, opts.fadeMs ?? TIMELINE_FADE_MS);
    }

    const fadeMs = opts.fadeMs ?? DEFAULT_FADE_MS;
    const quantize = opts.quantize ?? true;

    if (this.sectionChangeTimer) clearTimeout(this.sectionChangeTimer);

    const delay = quantize ? await this.msUntilNextBar() : 0;
    this.sectionChangeTimer = setTimeout(() => {
      this.applyMix(SECTION_MIX[section], fadeMs);
      this.setState({ currentSection: section });
    }, delay);
  }

  /**
   * timeline 모드 전용: 원곡 학습 타임라인에서 해당 섹션의 시작 지점을 찾아
   * 모든 스템을 동시에 그 위치로 seek 한다. 해당 섹션이 이번 곡에서 감지되지 않았다면
   * (예: 원곡에 브릿지가 없는 경우) 조용히 무시한다.
   *
   * 인도자의 멘트/버튼으로 "점프"하는 경우에만 호출된다 (예: 후렴을 한 번 더).
   * 점프 이후에는 그 지점부터 남은 타임라인을 다시 자동 예약(scheduleAutoFollow)해서,
   * 이후 구간(예: 그 다음에 이어지는 기타 솔로)은 다시 멘트 없이 자동으로 따라간다.
   */
  private async goToTimelineSection(
    section: SectionId,
    fadeMs: number
  ): Promise<void> {
    const cue = this.song?.timeline?.find((c) => c.section === section);
    if (!cue) return;

    if (this.sectionChangeTimer) clearTimeout(this.sectionChangeTimer);

    await Promise.all(
      Object.values(this.sounds).map((s) =>
        s?.setStatusAsync({ positionMillis: cue.atMs, shouldPlay: true })
      )
    );
    this.applyMix(cue.mix ?? SECTION_MIX[section], fadeMs);
    this.setState({ currentSection: section });
    this.scheduleAutoFollow(cue.atMs);
  }

  /**
   * timeline 모드에서 "자동 추종" 켜짐/꺼짐을 전환한다.
   * 기타 솔로처럼 인도자가 마이크에 대고 말하지 않는 구간은 애초에 음성으로
   * 트리거할 방법이 없기 때문에, 학습된 곡은 기본적으로 이 자동 추종이 켜진
   * 상태로 재생된다. 다만 인도자가 원곡과 다르게 진행하고 싶을 때(즉흥으로
   * 후렴을 반복하는 등)를 위해 언제든 끄고 수동으로만 조작할 수 있게 한다.
   */
  async setAutoFollow(enabled: boolean): Promise<void> {
    this.setState({ autoFollowEnabled: enabled });
    if (!enabled) {
      this.clearAutoFollowTimers();
      return;
    }
    const posMs = await this.getReferencePositionMs();
    this.scheduleAutoFollow(posMs);
  }

  /**
   * fromMs 이후에 나오는 학습된 타임라인 큐들을, 원곡과 같은 상대 타이밍으로
   * setTimeout 예약해둔다. 각 큐가 도래하면 (곡별로 학습된) 악기 믹스로
   * 자동 전환되어 — 인도자의 어떤 말/버튼 조작 없이도 — 기타 솔로 같은
   * 구간이 원곡 그대로 자연스럽게 이어진다.
   */
  private scheduleAutoFollow(fromMs: number) {
    this.clearAutoFollowTimers();
    const song = this.song;
    if (!song || song.mode !== "timeline" || !this.state.autoFollowEnabled) {
      return;
    }

    const upcoming = (song.timeline ?? []).filter((c) => c.atMs > fromMs);
    this.autoFollowTimers = upcoming.map((cue) =>
      setTimeout(() => {
        this.applyMix(cue.mix ?? SECTION_MIX[cue.section], DEFAULT_FADE_MS);
        this.setState({ currentSection: cue.section });
      }, cue.atMs - fromMs)
    );
  }

  private clearAutoFollowTimers() {
    this.autoFollowTimers.forEach(clearTimeout);
    this.autoFollowTimers = [];
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
    this.clearAutoFollowTimers();
  }
}
