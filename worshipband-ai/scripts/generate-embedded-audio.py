#!/usr/bin/env python3
"""
assets/tracks/ 의 데모 mp3 들을 base64 data URI 로 인코딩해서
src/constants/embeddedAudio.generated.ts 를 (다시) 생성한다.

require() 로 asset 파일을 직접 참조하는 대신 이 방식을 쓰는 이유:
웹으로 내보냈을 때, 브라우저가 그 asset 파일을 별도 네트워크 요청으로
다시 받아오는 과정이 호스팅 환경에 따라 실패하는 걸 실제로 겪었다
(WAV/MP3 둘 다 동일하게 "MEDIA_ELEMENT_ERROR: Format error" — 파일
자체는 정상인데도 호스팅 쪽 요청 처리 과정에서 문제가 생기는 것으로
추정된다). data URI 는 애초에 네트워크 요청이 없으므로 그 문제를
원천적으로 피한다. 데모/placeholder 오디오에만 쓰는 방식이고,
실제 서비스 트랙까지 전부 이렇게 인라인하라는 뜻은 아니다.

실행: python3 scripts/generate-embedded-audio.py  (worshipband-ai/ 에서)
"""
import base64
from pathlib import Path

ROOT = Path(__file__).parent.parent
TRACKS = ROOT / "assets" / "tracks"
OUT = ROOT / "src" / "constants" / "embeddedAudio.generated.ts"

FILES = [
    (TRACKS / "drums.mp3", "DRUMS_LOOP"),
    (TRACKS / "bass.mp3", "BASS_LOOP"),
    (TRACKS / "guitar.mp3", "GUITAR_LOOP"),
    (TRACKS / "piano.mp3", "PIANO_LOOP"),
    (TRACKS / "synth.mp3", "SYNTH_LOOP"),
    (TRACKS / "learned-demo" / "drums.mp3", "DRUMS_LEARNED"),
    (TRACKS / "learned-demo" / "bass.mp3", "BASS_LEARNED"),
    (TRACKS / "learned-demo" / "guitar.mp3", "GUITAR_LEARNED"),
    (TRACKS / "learned-demo" / "piano.mp3", "PIANO_LEARNED"),
    (TRACKS / "learned-demo" / "synth.mp3", "SYNTH_LEARNED"),
]

HEADER = """/**
 * 데모/placeholder 오디오를 base64 data URI 로 직접 인코딩해 넣은 파일.
 * require() 로 별도 파일을 참조하면, 웹으로 배포했을 때 그 파일을 다시
 * 네트워크로 받아와야 하는데 배포 환경에 따라 그 요청이 실패하는 걸 실제로
 * 겪었다 (원인 특정이 어려운 호스팅/CDN 레벨 문제로 추정 — WAV/MP3 둘 다
 * 동일하게 실패했다). data URI 는 네트워크 요청 자체가 없어서 이 문제를
 * 원천적으로 피한다. 자동 생성된 파일이므로 직접 수정하지 말 것 —
 * scripts/generate-embedded-audio.py 참고 (동일 로직을 다시 실행하면 됨).
 */
"""


def main() -> None:
    lines = [HEADER]
    for path, name in FILES:
        data = path.read_bytes()
        b64 = base64.b64encode(data).decode("ascii")
        lines.append(f'export const {name} = "data:audio/mpeg;base64,{b64}";\n')
    OUT.write_text("\n".join(lines))
    print(f"wrote {OUT} ({OUT.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
