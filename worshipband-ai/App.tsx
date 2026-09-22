import React, { useState } from "react";
import {
  Pressable,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { MainScreen } from "@/screens/MainScreen";
import { SetlistScreen } from "@/screens/SetlistScreen";
import { SongConfig } from "@/types";

type Tab = "main" | "setlist";

export default function App() {
  const [tab, setTab] = useState<Tab>("main");
  const [selectedSong, setSelectedSong] = useState<SongConfig | undefined>();

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#2E3440" />

      <View style={styles.tabBar}>
        <TabButton
          label="찬양 진행"
          active={tab === "main"}
          onPress={() => setTab("main")}
        />
        <TabButton
          label="콘티 관리"
          active={tab === "setlist"}
          onPress={() => setTab("setlist")}
        />
      </View>

      {tab === "main" ? (
        <MainScreen song={selectedSong} />
      ) : (
        <SetlistScreen
          activeSongId={selectedSong?.id}
          onSelectSong={(song) => {
            setSelectedSong(song);
            setTab("main");
          }}
        />
      )}
    </SafeAreaView>
  );
}

function TabButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.tabButton, active && styles.tabButtonActive]}
    >
      <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#2E3440",
  },
  tabBar: {
    flexDirection: "row",
    paddingHorizontal: 12,
    paddingTop: 8,
    gap: 8,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    backgroundColor: "#3B4252",
  },
  tabButtonActive: {
    backgroundColor: "#5E81AC",
  },
  tabLabel: {
    color: "#D8DEE9",
    fontWeight: "600",
    fontSize: 15,
  },
  tabLabelActive: {
    color: "white",
  },
});
