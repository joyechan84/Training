import React from "react";
import { SafeAreaView, StatusBar, StyleSheet } from "react-native";

import { MainScreen } from "@/screens/MainScreen";

export default function App() {
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#2E3440" />
      <MainScreen />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#2E3440",
  },
});
