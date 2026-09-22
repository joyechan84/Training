import React from "react";
import { Pressable, StyleSheet, Text } from "react-native";

interface BigActionButtonProps {
  label: string;
  onPress: () => void;
  color?: string;
  active?: boolean;
}

/** 화면을 보지 않고도 누를 수 있도록 큰 터치 영역과 큰 글씨를 쓰는 비상용/수동 제어 버튼. */
export function BigActionButton({
  label,
  onPress,
  color = "#2E3440",
  active = false,
}: BigActionButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: color },
        active && styles.active,
        pressed && styles.pressed,
      ]}
    >
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 88,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    marginVertical: 8,
  },
  active: {
    borderWidth: 4,
    borderColor: "#A3BE8C",
  },
  pressed: {
    opacity: 0.7,
  },
  label: {
    color: "white",
    fontSize: 26,
    fontWeight: "700",
    textAlign: "center",
  },
});
