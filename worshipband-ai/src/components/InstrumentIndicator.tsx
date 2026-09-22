import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { InstrumentId, InstrumentMix } from "@/types";

const INSTRUMENT_ORDER: InstrumentId[] = ["drums", "bass", "piano", "synth"];
const INSTRUMENT_LABEL: Record<InstrumentId, string> = {
  drums: "🥁 드럼",
  bass: "🎸 베이스",
  piano: "🎹 피아노",
  synth: "🎛️ 신디",
};

interface InstrumentIndicatorProps {
  mix: InstrumentMix;
}

/** 현재 활성화된(볼륨이 켜진) 악기를 한눈에 보여주는 아이콘 로우. */
export function InstrumentIndicator({ mix }: InstrumentIndicatorProps) {
  return (
    <View style={styles.row}>
      {INSTRUMENT_ORDER.map((id) => {
        const level = mix[id];
        const isOn = level > 0.05;
        return (
          <View
            key={id}
            style={[styles.chip, isOn ? styles.chipOn : styles.chipOff]}
          >
            <Text style={styles.chipLabel}>{INSTRUMENT_LABEL[id]}</Text>
            <Text style={styles.chipValue}>{Math.round(level * 100)}%</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginVertical: 16,
  },
  chip: {
    flex: 1,
    marginHorizontal: 4,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: "center",
  },
  chipOn: {
    backgroundColor: "#A3BE8C",
  },
  chipOff: {
    backgroundColor: "#3B4252",
  },
  chipLabel: {
    color: "white",
    fontSize: 14,
    fontWeight: "600",
  },
  chipValue: {
    color: "white",
    fontSize: 12,
    marginTop: 2,
  },
});
