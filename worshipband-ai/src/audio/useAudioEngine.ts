import { useCallback, useEffect, useRef, useState } from "react";

import { AudioEngine } from "@/audio/AudioEngine";
import { EngineState, SectionId, SongConfig } from "@/types";

interface UseAudioEngineResult {
  state: EngineState;
  loadSong: (song: SongConfig) => Promise<void>;
  playAll: () => Promise<void>;
  stopAll: () => Promise<void>;
  goToSection: (section: SectionId) => Promise<void>;
  triggerFullBand: () => Promise<void>;
  shiftKey: (deltaSemitones: number) => Promise<void>;
  setAutoFollow: (enabled: boolean) => Promise<void>;
}

/** AudioEngine 인스턴스를 React 생명주기에 묶어주는 훅. */
export function useAudioEngine(): UseAudioEngineResult {
  const engineRef = useRef<AudioEngine>();
  if (!engineRef.current) engineRef.current = new AudioEngine();
  const engine = engineRef.current;

  const [state, setState] = useState<EngineState>(engine.getState());

  useEffect(() => {
    const unsubscribe = engine.subscribe(setState);
    return () => {
      unsubscribe();
      engine.unload();
    };
  }, [engine]);

  const loadSong = useCallback((song: SongConfig) => engine.loadSong(song), [
    engine,
  ]);
  const playAll = useCallback(() => engine.playAll(), [engine]);
  const stopAll = useCallback(() => engine.stopAll(), [engine]);
  const goToSection = useCallback(
    (section: SectionId) => engine.goToSection(section),
    [engine]
  );
  const triggerFullBand = useCallback(() => engine.triggerFullBand(), [
    engine,
  ]);
  const shiftKey = useCallback(
    (delta: number) => engine.shiftKey(delta),
    [engine]
  );
  const setAutoFollow = useCallback(
    (enabled: boolean) => engine.setAutoFollow(enabled),
    [engine]
  );

  return {
    state,
    loadSong,
    playAll,
    stopAll,
    goToSection,
    triggerFullBand,
    shiftKey,
    setAutoFollow,
  };
}
