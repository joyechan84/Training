import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  FlatList,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";

import { BigActionButton } from "@/components/BigActionButton";
import { songLearningApi } from "@/services";
import { LearningStatus, SetlistSong, SongConfig } from "@/types";

const STATUS_LABEL: Record<LearningStatus, string> = {
  PENDING: "대기중",
  ANALYZING: "분석중 (스템 분리·구간 탐지)",
  READY: "학습 완료",
  FAILED: "실패",
};

const STATUS_COLOR: Record<LearningStatus, string> = {
  PENDING: "#4C566A",
  ANALYZING: "#D08770",
  READY: "#A3BE8C",
  FAILED: "#BF616A",
};

interface SetlistScreenProps {
  /** 학습 완료된 곡을 "이번 예배 콘티"로 선택했을 때 호출된다. */
  onSelectSong: (song: SongConfig) => void;
  activeSongId?: string;
}

export function SetlistScreen({
  onSelectSong,
  activeSongId,
}: SetlistScreenProps) {
  const [title, setTitle] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [songs, setSongs] = useState<SetlistSong[]>([]);

  const refresh = useCallback(async () => {
    const list = await songLearningApi.listSetlist();
    setSongs(list);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // 진행 중인(PENDING/ANALYZING) 곡이 있는 동안에는 1초마다 상태를 다시 조회해
  // "분석중 → 학습 완료" 전환이 화면에 자동으로 반영되게 한다.
  const hasInFlight = songs.some(
    (s) => s.status === "PENDING" || s.status === "ANALYZING"
  );
  useEffect(() => {
    if (!hasInFlight) return;
    const timer = setInterval(refresh, 1000);
    return () => clearInterval(timer);
  }, [hasInFlight, refresh]);

  const handleSubmit = useCallback(async () => {
    setFormError(null);
    if (!title.trim() || !youtubeUrl.trim()) {
      setFormError("제목과 유튜브 링크를 모두 입력해주세요.");
      return;
    }
    if (!rightsConfirmed) {
      setFormError("음원 저작권/사용권 확인 체크가 필요합니다.");
      return;
    }
    setIsSubmitting(true);
    try {
      await songLearningApi.registerYoutubeSong({
        title: title.trim(),
        youtubeUrl: youtubeUrl.trim(),
        rightsConfirmed,
      });
      setTitle("");
      setYoutubeUrl("");
      setRightsConfirmed(false);
      await refresh();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "등록에 실패했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  }, [title, youtubeUrl, rightsConfirmed, refresh]);

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>콘티 등록</Text>
      <Text style={styles.caption}>
        유튜브 찬양 영상을 등록하면 AI가 곡 구성(인트로/절/후렴/기타 솔로 등)을
        학습해 자동 반주에 사용합니다.
      </Text>

      <TextInput
        style={styles.input}
        placeholder="곡 제목"
        placeholderTextColor="#8891A5"
        value={title}
        onChangeText={setTitle}
      />
      <TextInput
        style={styles.input}
        placeholder="https://www.youtube.com/watch?v=..."
        placeholderTextColor="#8891A5"
        autoCapitalize="none"
        autoCorrect={false}
        value={youtubeUrl}
        onChangeText={setYoutubeUrl}
      />

      <Pressable
        style={styles.rightsRow}
        onPress={() => setRightsConfirmed((v) => !v)}
      >
        <Switch value={rightsConfirmed} onValueChange={setRightsConfirmed} />
        <Text style={styles.rightsText}>
          이 음원의 저작권/사용권을 보유하고 있음을 확인합니다.
        </Text>
      </Pressable>

      {formError ? <Text style={styles.error}>{formError}</Text> : null}

      <BigActionButton
        label={isSubmitting ? "등록 중..." : "학습 요청"}
        color="#5E81AC"
        onPress={handleSubmit}
      />

      <Text style={[styles.heading, styles.listHeading]}>등록된 콘티</Text>
      <FlatList
        data={songs}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={styles.caption}>아직 등록된 곡이 없습니다.</Text>
        }
        renderItem={({ item }) => (
          <SetlistRow
            song={item}
            isActive={item.id === activeSongId}
            onSelect={() => item.songConfig && onSelectSong(item.songConfig)}
          />
        )}
      />
    </View>
  );
}

function SetlistRow({
  song,
  isActive,
  onSelect,
}: {
  song: SetlistSong;
  isActive: boolean;
  onSelect: () => void;
}) {
  return (
    <View style={[styles.row, isActive && styles.rowActive]}>
      <View style={styles.rowInfo}>
        <Text style={styles.rowTitle}>{song.title}</Text>
        <View
          style={[
            styles.badge,
            { backgroundColor: STATUS_COLOR[song.status] },
          ]}
        >
          <Text style={styles.badgeText}>{STATUS_LABEL[song.status]}</Text>
        </View>
        {song.status === "FAILED" && song.errorMessage ? (
          <Text style={styles.error}>{song.errorMessage}</Text>
        ) : null}
      </View>
      {song.status === "READY" ? (
        <Pressable style={styles.selectButton} onPress={onSelect}>
          <Text style={styles.selectButtonText}>
            {isActive ? "사용 중" : "이 곡 사용하기"}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#2E3440",
    padding: 20,
  },
  heading: {
    fontSize: 22,
    fontWeight: "700",
    color: "#ECEFF4",
    marginBottom: 6,
  },
  listHeading: {
    marginTop: 20,
  },
  caption: {
    color: "#D8DEE9",
    marginBottom: 14,
    lineHeight: 20,
  },
  input: {
    backgroundColor: "#3B4252",
    color: "#ECEFF4",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 10,
  },
  rightsRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    gap: 10,
  },
  rightsText: {
    color: "#D8DEE9",
    flex: 1,
  },
  error: {
    color: "#BF616A",
    marginBottom: 8,
  },
  list: {
    paddingBottom: 40,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#3B4252",
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  rowActive: {
    borderWidth: 2,
    borderColor: "#A3BE8C",
  },
  rowInfo: {
    flex: 1,
  },
  rowTitle: {
    color: "#ECEFF4",
    fontSize: 17,
    fontWeight: "600",
    marginBottom: 6,
  },
  badge: {
    alignSelf: "flex-start",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeText: {
    color: "white",
    fontSize: 12,
    fontWeight: "600",
  },
  selectButton: {
    backgroundColor: "#5E81AC",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  selectButtonText: {
    color: "white",
    fontWeight: "600",
  },
});
