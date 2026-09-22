"""
BPM 추정 + 곡 구조(인트로/절/후렴/브릿지/기타 솔로/엔딩) 자동 탐지.

접근 방식 (전통적인 MIR 파이프라인, 별도 학습 모델 없이 librosa 만으로 구성):

1. librosa.beat.beat_track 으로 BPM을 추정한다.
2. 크로마(chroma) 특징의 자기유사도(self-similarity) 행렬에서 novelty curve를
   뽑아 피크 지점을 "구간 경계 후보"로 삼는다 (Foote 2000 의 체커보드 커널
   novelty 탐지를 librosa.segment.recurrence_matrix 로 근사).
3. 각 구간에 휴리스틱으로 라벨을 붙인다:
   - 첫 구간 = INTRO, 마지막 구간 = ENDING
   - RMS 라우드니스가 가장 큰 구간 = CHORUS
   - 분리된 vocals 스템 에너지가 낮고 guitar 스템 에너지가 평균보다 높은
     구간 = SOLO (= AI가 새로 연주를 만드는 게 아니라, 원곡에서 실제로
     보컬 없이 기타가 두드러지는 구간을 그대로 지목하는 것)
   - 나머지는 등장 순서로 VERSE / BRIDGE 를 나눔

실제 프로덕션에서는 이 단순 휴리스틱보다 사전 학습된 구조 분석 모델을 쓰는
편이 더 정확하다 (예: 다수의 CCM/찬양 곡으로 파인튜닝한 분류기). 여기서는
외부 모델 없이 설명 가능한 베이스라인을 제공하는 데 목적이 있다.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import List

import librosa
import numpy as np


@dataclass
class DetectedCue:
    section: str  # 앱의 SectionId 문자열과 동일 (INTRO/VERSE/CHORUS/...)
    at_ms: int


@dataclass
class StructureResult:
    bpm: float
    beats_per_bar: int
    timeline: List[DetectedCue]


def detect_structure(
    mixed_wav: Path, guitar_wav: Path, vocals_wav: Path
) -> StructureResult:
    y, sr = librosa.load(str(mixed_wav), sr=None, mono=True)

    tempo, _beat_frames = librosa.beat.beat_track(y=y, sr=sr)

    segments = _segment_boundaries(y, sr)
    loudness = [_rms(y, sr, s, e) for s, e in segments]

    guitar_y, _ = librosa.load(str(guitar_wav), sr=sr, mono=True)
    vocals_y, _ = librosa.load(str(vocals_wav), sr=sr, mono=True)

    labels = _label_segments(segments, loudness, guitar_y, vocals_y, sr)

    cues = [
        DetectedCue(section=label, at_ms=int(round(start * 1000)))
        for (start, _end), label in zip(segments, labels)
    ]
    return StructureResult(
        bpm=float(tempo), beats_per_bar=4, timeline=_dedupe_consecutive(cues)
    )


def _segment_boundaries(y: np.ndarray, sr: int) -> List[tuple[float, float]]:
    chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
    sim = librosa.segment.recurrence_matrix(chroma, mode="affinity", sym=True)

    # 인접한 두 구간(전/후 윈도우) 간 유사도 차이가 클수록 경계일 가능성이 높다.
    window = 16
    novelty = np.zeros(sim.shape[0])
    for i in range(window, sim.shape[0] - window):
        before = sim[i - window : i, i - window : i].mean()
        after = sim[i : i + window, i : i + window].mean()
        novelty[i] = abs(after - before)

    peak_frames = librosa.util.peak_pick(
        novelty, pre_max=8, post_max=8, pre_avg=8, post_avg=8, delta=0.02, wait=32
    )
    boundary_times = librosa.frames_to_time(peak_frames, sr=sr)
    total_sec = len(y) / sr
    boundary_times = np.concatenate([[0.0], boundary_times, [total_sec]])
    boundary_times = np.unique(np.round(boundary_times, 2))

    segments = list(zip(boundary_times[:-1], boundary_times[1:]))
    return segments if segments else [(0.0, total_sec)]


def _rms(y: np.ndarray, sr: int, start: float, end: float) -> float:
    clip = y[int(start * sr) : int(end * sr)]
    return float(np.sqrt(np.mean(clip**2))) if clip.size else 0.0


def _label_segments(
    segments: List[tuple[float, float]],
    loudness: List[float],
    guitar_y: np.ndarray,
    vocals_y: np.ndarray,
    sr: int,
) -> List[str]:
    labels = [""] * len(segments)
    chorus_idx = int(np.argmax(loudness))
    labels[0] = "INTRO"
    labels[-1] = "ENDING"
    labels[chorus_idx] = "CHORUS"

    guitar_energies = [_rms(guitar_y, sr, s, e) for s, e in segments]
    avg_guitar_energy = float(np.mean(guitar_energies)) if guitar_energies else 0.0

    for i, (s, e) in enumerate(segments):
        if labels[i]:
            continue
        vocal_energy = _rms(vocals_y, sr, s, e)
        guitar_energy = guitar_energies[i]
        is_instrumental = vocal_energy < 0.02
        guitar_prominent = guitar_energy > avg_guitar_energy
        if is_instrumental and guitar_prominent:
            labels[i] = "SOLO"
        else:
            labels[i] = "VERSE" if i < chorus_idx else "BRIDGE"

    return labels


def _dedupe_consecutive(cues: List[DetectedCue]) -> List[DetectedCue]:
    result: List[DetectedCue] = []
    last_section = None
    for cue in cues:
        if cue.section != last_section:
            result.append(cue)
            last_section = cue.section
    return result
