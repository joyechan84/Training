"""탐지된 구조(StructureResult)와 분리된 스템 경로들을 모아
모바일 앱의 SongConfig(JSON, src/types.ts 와 동일한 스키마)로 조립한다."""
from __future__ import annotations

from pathlib import Path
from typing import Dict

from .detect_sections import StructureResult
from .separate_stems import INSTRUMENT_TO_DEMUCS_STEM


def build_song_config(
    song_id: str,
    title: str,
    source_youtube_url: str,
    stems: Dict[str, Path],
    structure: StructureResult,
    public_base_url: str,
) -> dict:
    """
    public_base_url: 분리된 wav 파일들을 앱이 내려받을 수 있게 정적으로 서빙하는
    베이스 경로 (예: 이 FastAPI 서버가 mount 한 "/static"). 앱은
    `${API_BASE}${public_base_url}/{song_id}/{stem}.wav` 를 { uri } 형태로
    Audio.Sound.createAsync 에 그대로 넘긴다.
    """
    tracks = {
        instrument: f"{public_base_url}/{song_id}/{demucs_stem}.wav"
        for instrument, demucs_stem in INSTRUMENT_TO_DEMUCS_STEM.items()
    }

    return {
        "id": song_id,
        "title": title,
        "bpm": round(structure.bpm, 1),
        "beatsPerBar": structure.beats_per_bar,
        # TODO: librosa.feature.chroma_cqt 평균 프로파일 + Krumhansl-Schmuckler
        # 키 추정 알고리즘을 붙이면 baseKey 도 자동으로 채울 수 있다.
        "baseKey": "UNKNOWN",
        "mode": "timeline",
        "sourceYoutubeUrl": source_youtube_url,
        "tracks": tracks,
        "timeline": [
            {
                "section": cue.section,
                "atMs": cue.at_ms,
                **({"mix": cue.mix} if cue.mix is not None else {}),
            }
            for cue in structure.timeline
        ],
    }
