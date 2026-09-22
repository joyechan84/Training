import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
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

export function MainScreen({ song = DEMO_SONG }: MainScreenProps) {
  const {
    state,
    loadSong,
    playAll,
    stopAll,
    goToSection,
    triggerFullBand,
    shiftKey,
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
