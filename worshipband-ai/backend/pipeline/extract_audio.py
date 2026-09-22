"""유튜브 영상에서 오디오 트랙만 추출한다."""
from __future__ import annotations

import subprocess
from pathlib import Path


def extract_audio(youtube_url: str, out_dir: Path) -> Path:
    """
    yt-dlp 로 오디오만 다운로드해 wav 로 변환한다.

    저작권 주의: 이 함수는 사용자가 등록 시 확인한 rightsConfirmed 가 true 인
    요청에 대해서만 호출된다 (main.py 의 register_song 참고). 그래도 실제
    서비스에서는 반드시 (1) 교회가 직접 녹음/제작한 음원이거나, (2) 저작권자의
    명시적 허가를 받은 음원이거나, (3) CCLI SongSelect 등 합법적 라이선스로
    제공되는 반주/멀티트랙 음원으로 대상을 제한해야 한다. 임의의 유튜브 커버
    영상을 무단으로 다운로드해 반주로 재사용하는 용도로 쓰면 안 된다.
    """
    out_dir.mkdir(parents=True, exist_ok=True)
    output_template = str(out_dir / "source.%(ext)s")

    subprocess.run(
        [
            "yt-dlp",
            "-x",
            "--audio-format",
            "wav",
            "--audio-quality",
            "0",
            "-o",
            output_template,
            youtube_url,
        ],
        check=True,
    )
    return out_dir / "source.wav"
