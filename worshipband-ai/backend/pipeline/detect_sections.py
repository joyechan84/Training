"""
BPM 추정 + 곡 구조(인트로/절/후렴/브릿지/기타 솔로/엔딩) 자동 탐지,
그리고 각 구간에서 "실제로 어떤 악기가 얼마나 연주되고 있는지"(per-instrument
mix)까지 함께 산출한다.

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
4. **각 구간의 악기별 mix**: drums/bass/guitar/piano 스템(+ synth 로 매핑되는
   "other" 스템)을 각각 로드해서, 구간별 RMS 를 그 악기가 곡 전체에서 낸
   최대 RMS로 나눠 0~1 사이 값으로 정규화한다. 이게 바로 "이 곡은 이
   구간에서 이 악기만 나온다"를 실제로 학습한 결과이며, 장르에 상관없이
   쓰는 SECTION_MIX 프리셋보다 이 곡 하나에 대해서는 더 정확하다. 앱은 이
   값이 있으면 프리셋 대신 이 값을 쓴다 (TimelineCue.mix, 없으면 프리셋으로
   대체).

이 휴리스틱들은 베이스라인이다. 실제 서비스 품질을 높이려면 다수의 CCM/찬양
곡으로 검증하며 임계값을 튜닝하거나, 구조 분석 전용 모델로 교체하는 걸
권장한다.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional

import librosa
import numpy as np

# InstrumentId -> separate_stems() 가 반환하는 demucs 스템 키
INSTRUMENT_STEM_KEYS = {
    "drums": "drums",
    "bass": "bass",
    "guitar": "guitar",
    "piano": "piano",
    "synth": "other",
}


@dataclass
class DetectedCue:
    section: str  # 앱의 SectionId 문자열과 동일 (INTRO/VERSE/CHORUS/...)
    at_ms: int
    mix: Optional[Dict[str, float]] = field(default=None)


@dataclass
class StructureResult:
    bpm: float
    beats_per_bar: int
    timeline: List[DetectedCue]


def detect_structure(mixed_wav: Path, stems: Dict[str, Path]) -> StructureResult:
    """
    mixed_wav: 유튜브에서 추출한 원곡 오디오(구조 경계 탐지에 사용).
    stems: separate_stems() 의 반환값 전체
           ({"drums","bass","other","vocals","guitar","piano"} -> Path).
    """
    y, sr = librosa.load(str(mixed_wav), sr=None, mono=True)

    tempo, _beat_frames = librosa.beat.beat_track(y=y, sr=sr)

    segments = _segment_boundaries(y, sr)
    loudness = [_rms(y, sr, s, e) for s, e in segments]

    guitar_y, _ = librosa.load(str(stems["guitar"]), sr=sr, mono=True)
    vocals_y, _ = librosa.load(str(stems["vocals"]), sr=sr, mono=True)
    labels = _label_segments(segments, loudness, guitar_y, vocals_y, sr)

    segment_mixes = _compute_segment_mixes(stems, segments, sr)

    cues = [
        DetectedCue(
            section=label, at_ms=int(round(start * 1000)), mix=mix
        )
        for (start, _end), label, mix in zip(segments, labels, segment_mixes)
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


def _compute_segment_mixes(
    stems: Dict[str, Path], segments: List[tuple[float, float]], sr: int
) -> List[Dict[str, float]]:
    """
    구간별로 각 악기가 실제로 얼마나 연주되고 있는지(0~1)를 계산한다.
    악기별로 "이 곡에서 그 악기가 가장 크게 나온 구간"을 1.0 기준으로 삼아
    정규화한다 — 그래야 원래 조용히 녹음된 악기(예: 어쿠스틱 패드)가 항상
    0에 가까운 값만 나오는 걸 피할 수 있다.
    """
    loaded = {
        instrument: librosa.load(str(stems[stem_key]), sr=sr, mono=True)[0]
        for instrument, stem_key in INSTRUMENT_STEM_KEYS.items()
    }
    segment_energies = {
        instrument: [_rms(y, sr, s, e) for s, e in segments]
        for instrument, y in loaded.items()
    }
    peak_energy = {
        instrument: max(energies) or 1.0
        for instrument, energies in segment_energies.items()
    }

    return [
        {
            instrument: round(
                min(1.0, segment_energies[instrument][i] / peak_energy[instrument]), 3
            )
            for instrument in INSTRUMENT_STEM_KEYS
        }
        for i in range(len(segments))
    ]


def _dedupe_consecutive(cues: List[DetectedCue]) -> List[DetectedCue]:
    """연속으로 같은 라벨이 나오면 첫 큐(및 그 mix)만 남긴다."""
    result: List[DetectedCue] = []
    last_section = None
    for cue in cues:
        if cue.section != last_section:
            result.append(cue)
            last_section = cue.section
    return result
