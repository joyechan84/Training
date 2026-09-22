import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { SECTION_LABEL_KO } from "@/constants/sections";
import { EngineState } from "@/types";

interface NowPlayingHeaderProps {
  state: EngineState;
  songTitle: string;
  baseKey: string;
}

export function NowPlayingHeader({
  state,
  songTitle,
  baseKey,
}: NowPlayingHeaderProps) {
  const displayKey = shiftKeyLabel(baseKey, state.keyOffsetSemitones);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{songTitle}</Text>
      <View style={styles.row}>
        <Stat label="BPM" value={String(Math.round(state.bpm))} />
        <Stat label="Key" value={displayKey} />
        <Stat label="파트" value={SECTION_LABEL_KO[state.currentSection]} />
      </View>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

function shiftKeyLabel(baseKey: string, semitones: number): string {
  const idx = NOTE_NAMES.indexOf(baseKey.toUpperCase());
  if (idx === -1) return baseKey;
  const shifted = ((idx + semitones) % 12 + 12) % 12;
  return NOTE_NAMES[shifted];
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 16,
    alignItems: "center",
  },
  title: {
    fontSize: 22,
    fontWeight: "600",
    color: "#ECEFF4",
    marginBottom: 12,
  },
  row: {
    flexDirection: "row",
    gap: 24,
  },
  stat: {
    alignItems: "center",
    minWidth: 72,
  },
  statValue: {
    fontSize: 34,
    fontWeight: "800",
    color: "#88C0D0",
  },
  statLabel: {
    fontSize: 14,
    color: "#D8DEE9",
    marginTop: 2,
  },
});
