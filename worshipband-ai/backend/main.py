"""
WorshipBand AI 학습 서버 (설계 초안 / 레퍼런스 구현).

    POST /songs        { title, youtubeUrl, rightsConfirmed } -> SetlistSong (PENDING)
    GET  /songs         -> SetlistSong[]
    GET  /songs/{id}    -> SetlistSong

이 계약은 앱의 src/services/songLearningApi.ts, src/services/types.ts 와
정확히 맞아야 한다 (필드명까지 동일: id/title/youtubeUrl/status/songConfig/
errorMessage/requestedAt).

백그라운드 파이프라인: 오디오 추출(pipeline/extract_audio.py) →
6-스템 분리(pipeline/separate_stems.py) → 구조/기타 솔로 구간 탐지
(pipeline/detect_sections.py) → SongConfig 조립(pipeline/build_song_config.py).

저장소는 데모용으로 프로세스 메모리를 사용한다. 실제 배포에서는
DB(Postgres 등)와 오브젝트 스토리지(S3 등)로 교체해야 하고, 파이프라인도
Celery/RQ 같은 실제 작업 큐로 옮겨야 한다(오디오 분석은 수 분 단위로
오래 걸리고 GPU 자원을 점유하므로, FastAPI 프로세스 안의 BackgroundTasks로
직접 돌리는 건 이 설계 초안에서만 쓸 단순화다).

주의: requirements.txt 에 적힌 대로, 이 코드는 이 리포지토리가 만들어진
샌드박스 환경(인터넷/GPU 없음)에서 실제로 실행/검증되지 않았다. 로컬 또는
클라우드 GPU 환경에서 yt-dlp / demucs 설치 후 직접 검증이 필요하다.
"""
from __future__ import annotations

import shutil
import traceback
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional

from fastapi import BackgroundTasks, FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from pipeline.build_song_config import build_song_config
from pipeline.detect_sections import detect_structure
from pipeline.extract_audio import extract_audio
from pipeline.separate_stems import separate_stems

STORAGE_DIR = Path(__file__).parent / "storage"
STORAGE_DIR.mkdir(exist_ok=True)

app = FastAPI(title="WorshipBand AI Learning API")
app.mount("/static", StaticFiles(directory=str(STORAGE_DIR)), name="static")


class RegisterSongRequest(BaseModel):
    title: str
    youtubeUrl: str
    rightsConfirmed: bool


class SetlistSong(BaseModel):
    id: str
    title: str
    youtubeUrl: str
    status: str  # PENDING | ANALYZING | READY | FAILED
    songConfig: Optional[dict] = None
    errorMessage: Optional[str] = None
    requestedAt: str


_songs: Dict[str, SetlistSong] = {}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


@app.post("/songs", response_model=SetlistSong)
def register_song(req: RegisterSongRequest, background_tasks: BackgroundTasks):
    if not req.rightsConfirmed:
        raise HTTPException(
            status_code=400,
            detail=(
                "음원 저작권/사용권 확인(rightsConfirmed=true) 없이는 "
                "학습을 시작할 수 없습니다."
            ),
        )

    song_id = f"song_{uuid.uuid4().hex[:12]}"
    song = SetlistSong(
        id=song_id,
        title=req.title,
        youtubeUrl=req.youtubeUrl,
        status="PENDING",
        requestedAt=_now_iso(),
    )
    _songs[song_id] = song
    background_tasks.add_task(_run_pipeline, song_id, req.youtubeUrl, req.title)
    return song


@app.get("/songs", response_model=List[SetlistSong])
def list_songs():
    return sorted(_songs.values(), key=lambda s: s.requestedAt, reverse=True)


@app.get("/songs/{song_id}", response_model=SetlistSong)
def get_song(song_id: str):
    song = _songs.get(song_id)
    if not song:
        raise HTTPException(status_code=404, detail="곡을 찾을 수 없습니다.")
    return song


def _run_pipeline(song_id: str, youtube_url: str, title: str) -> None:
    work_dir = STORAGE_DIR / song_id
    try:
        _songs[song_id].status = "ANALYZING"

        source_wav = extract_audio(youtube_url, work_dir / "raw")
        stems = separate_stems(source_wav, work_dir / "stems")
        structure = detect_structure(mixed_wav=source_wav, stems=stems)

        public_dir = STORAGE_DIR / song_id
        public_dir.mkdir(parents=True, exist_ok=True)
        for name, path in stems.items():
            if name == "vocals":
                continue  # 반주에는 쓰지 않으므로 공개 서빙하지 않는다
            shutil.copy(path, public_dir / f"{name}.wav")

        song_config = build_song_config(
            song_id=song_id,
            title=title,
            source_youtube_url=youtube_url,
            stems=stems,
            structure=structure,
            public_base_url="/static",
        )

        _songs[song_id].status = "READY"
        _songs[song_id].songConfig = song_config

    except Exception as exc:  # noqa: BLE001 - 실패 사유를 그대로 사용자에게 보여줘야 함
        _songs[song_id].status = "FAILED"
        _songs[song_id].errorMessage = str(exc)
        traceback.print_exc()
