"""htdemucs_6s 모델로 원곡을 6개 스템(drums/bass/other/vocals/guitar/piano)으로 분리한다."""
from __future__ import annotations

import subprocess
from pathlib import Path
from typing import Dict

DEMUCS_STEMS = ["drums", "bass", "other", "vocals", "guitar", "piano"]

# InstrumentId -> demucs 가 출력하는 스템 파일명.
# htdemucs_6s 는 guitar/piano 를 별도 스템으로 직접 제공하므로 이 앱의 악기
# 구성과 자연스럽게 맞아떨어진다. "synth"/패드류 전용 스템은 없어서 남는
# "other" (신스/현악 등 나머지 악기가 섞인 스템)를 그대로 쓴다.
INSTRUMENT_TO_DEMUCS_STEM = {
    "drums": "drums",
    "bass": "bass",
    "guitar": "guitar",
    "piano": "piano",
    "synth": "other",
}


def separate_stems(source_wav: Path, out_dir: Path) -> Dict[str, Path]:
    """
    demucs CLI(htdemucs_6s)를 호출해 6-스템으로 분리하고, 각 스템 이름(demucs
    기준) -> 파일 경로 딕셔너리를 반환한다. "vocals" 는 반주 트랙으로 쓰지
    않지만, 기타 솔로 구간 탐지(detect_sections.py)에서 "보컬이 없는 구간"을
    판별하는 데 필요해서 그대로 남겨둔다.
    """
    out_dir.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [
            "python3",
            "-m",
            "demucs",
            "-n",
            "htdemucs_6s",
            "-o",
            str(out_dir),
            str(source_wav),
        ],
        check=True,
    )

    demucs_out_dir = out_dir / "htdemucs_6s" / source_wav.stem
    return {stem: demucs_out_dir / f"{stem}.wav" for stem in DEMUCS_STEMS}
