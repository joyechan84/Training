import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";

import { useAudioEngine } from "@/audio/useAudioEngine";
import { BigActionButton } from "@/components/BigActionButton";
import { InstrumentIndicator } from "@/components/InstrumentIndicator";
import { NowPlayingHeader } from "@/components/NowPlayingHeader";
import { DEMO_SONG } from "@/constants/demoSong";
import { useVoiceIntentEngine } from "@/hooks/useVoiceIntentEngine";
import { SongConfig, VoiceIntent } from "@/types";

interface MainScreenProps {
  /** 콘티에서 선택된 학습 곡. 없으면 배선 확인용 데모 곡을 사용한다. */
  song?: SongConfig;
}

/**
 * 임시 디버그용: 우리 AudioEngine(expo-av, setInterval 기반 볼륨 램프)을 완전히
 * 우회해서 브라우저 Web Audio API로 아주 단순한 비프음을 직접 재생한다.
 * "소리가 전혀 안 들린다" 리포트를 받았을 때, 문제가 (a) 이 페이지/브라우저에서
 * 오디오 재생 자체가 막혀있는 것인지, (b) 우리 엔진의 볼륨 램프 방식에만 있는
 * 문제인지를 가르기 위한 것. 정식 기능이 아니므로 웹에서만 노출한다.
 */
function playWebDebugBeep() {
  const AudioContextCtor =
    (window as any).AudioContext || (window as any).webkitAudioContext;
  const ctx = new AudioContextCtor();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.value = 880;
  gain.gain.value = 0.5;
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 1);
}

export function MainScreen({ song = DEMO_SONG }: MainScreenProps) {
  const {
    state,
    loadSong,
    playAll,
    stopAll,
    goToSection,
    triggerFullBand,
    shiftKey,
    setAutoFollow,
  } = useAudioEngine();

  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
    loadSong(song).finally(() => setIsLoading(false));
  }, [loadSong, song]);

  const handleIntent = useCallback(
    (intent: VoiceIntent) => {
      switch (intent.type) {
        case "SECTION":
          goToSection(intent.section);
          break;
        case "FULL_BAND":
          triggerFullBand();
          break;
        case "KEY_SHIFT":
          shiftKey(intent.semitones);
          break;
      }
    },
    [goToSection, triggerFullBand, shiftKey]
  );

  const {
    isListening,
    lastTranscript,
    error: voiceError,
    start,
    stop,
  } = useVoiceIntentEngine({ onIntent: handleIntent });

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#88C0D0" />
        <Text style={styles.loadingText}>트랙 로딩 중...</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <NowPlayingHeader
        state={state}
        songTitle={song.title}
        baseKey={song.baseKey}
      />

      <InstrumentIndicator mix={state.mix} />

      {Platform.OS === "web" ? (
        <BigActionButton
          label="🔊 소리 테스트 (디버그용 비프음)"
          color="#EBCB8B"
          onPress={playWebDebugBeep}
        />
      ) : null}

      {song.mode === "timeline" ? (
        <View style={styles.autoFollowRow}>
          <View style={styles.autoFollowText}>
            <Text style={styles.autoFollowLabel}>자동 진행 (원곡 흐름 자동 추종)</Text>
            <Text style={styles.autoFollowCaption}>
              기타 솔로처럼 멘트가 없는 구간도 학습된 원곡 그대로 자동 전환됩니다.
            </Text>
          </View>
          <Switch
            value={state.autoFollowEnabled}
            onValueChange={setAutoFollow}
          />
        </View>
      ) : null}

      {state.playbackError ? (
        <Text style={styles.error}>⚠️ {state.playbackError}</Text>
      ) : null}

      <BigActionButton
        label={isListening ? "🎙️ 듣는 중 (탭하여 정지)" : "🎙️ 음성 인식 시작"}
        color={isListening ? "#BF616A" : "#5E81AC"}
        onPress={isListening ? stop : start}
      />

      {voiceError ? <Text style={styles.error}>{voiceError}</Text> : null}
      {lastTranscript ? (
        <Text style={styles.transcript}>"{lastTranscript}"</Text>
      ) : null}

      <View style={styles.grid}>
        <BigActionButton
          label="처음부터"
          color="#4C566A"
          active={state.currentSection === "INTRO"}
          onPress={async () => {
            await playAll();
            goToSection("INTRO");
          }}
        />
        <BigActionButton
          label="후렴"
          color="#D08770"
          active={state.currentSection === "CHORUS"}
          onPress={() => goToSection("CHORUS")}
        />
        <BigActionButton
          label="기타 솔로"
          color="#B48EAD"
          active={state.currentSection === "SOLO"}
          onPress={() => goToSection("SOLO")}
        />
        <BigActionButton
          label="조용히"
          color="#5E81AC"
          active={state.currentSection === "QUIET"}
          onPress={() => goToSection("QUIET")}
        />
        <BigActionButton
          label="엔딩"
          color="#4C566A"
          active={state.currentSection === "ENDING"}
          onPress={() => goToSection("ENDING")}
        />
        <BigActionButton label="키 +1" color="#A3BE8C" onPress={() => shiftKey(1)} />
        <BigActionButton label="키 -1" color="#A3BE8C" onPress={() => shiftKey(-1)} />
        <BigActionButton
          label="정지"
          color="#BF616A"
          active={state.currentSection === "STOP"}
          onPress={stopAll}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    paddingBottom: 60,
    backgroundColor: "#2E3440",
    flexGrow: 1,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2E3440",
  },
  loadingText: {
    color: "#ECEFF4",
    marginTop: 12,
    fontSize: 16,
  },
  grid: {
    marginTop: 8,
  },
  autoFollowRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#3B4252",
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
  },
  autoFollowText: {
    flex: 1,
    marginRight: 10,
  },
  autoFollowLabel: {
    color: "#ECEFF4",
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 4,
  },
  autoFollowCaption: {
    color: "#D8DEE9",
    fontSize: 12,
    lineHeight: 16,
  },
  transcript: {
    color: "#D8DEE9",
    fontStyle: "italic",
    textAlign: "center",
    marginBottom: 8,
  },
  error: {
    color: "#BF616A",
    textAlign: "center",
    marginBottom: 8,
  },
});
