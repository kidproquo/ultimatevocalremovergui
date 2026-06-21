"""FastAPI application exposing UVR separation as a web service."""
from __future__ import annotations

import os
import shutil

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from . import registry
from .jobs import store
from .schemas import (
    Arch,
    DownloadRequest,
    JobInfo,
    ModelInfo,
    OutputFormat,
    SeparationOptions,
)
from .separation import run_separation

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.environ.get("UVR_DATA_DIR", os.path.join(REPO_ROOT, "data"))
UPLOAD_DIR = os.path.join(DATA_DIR, "uploads")
JOBS_DIR = os.path.join(DATA_DIR, "jobs")
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(JOBS_DIR, exist_ok=True)

app = FastAPI(title="Ultimate Vocal Remover API", version="1.0.0")

# Frontend is served from a different origin in dev; allow it.
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("UVR_CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/system")
def system():
    """Device/GPU info for the UI (cached lightweight torch probe)."""
    from .separation import device_info

    return device_info()


@app.get("/api/models", response_model=list[ModelInfo])
def get_models():
    return registry.list_models()


@app.post("/api/models/download", response_model=JobInfo)
def download(req: DownloadRequest):
    job = store.create("download", message=f"Downloading {req.name}…", options=req.model_dump())

    def _task(j):
        registry.download_model(req.arch, req.name, j)
        j.update(message=f"Downloaded {req.name}")

    store.submit(job, _task)
    return job.to_info()


@app.post("/api/separate", response_model=JobInfo)
async def separate(
    file: UploadFile = File(...),
    arch: Arch = Form(...),
    model_name: str = Form(...),
    primary_stem_only: bool = Form(False),
    secondary_stem_only: bool = Form(False),
    output_format: OutputFormat = Form(OutputFormat.wav),
    normalization: bool = Form(False),
    denoise: bool = Form(False),
    semitone_shift: float = Form(0.0),
    aggression: int = Form(10),
    tta: bool = Form(False),
    window_size: int = Form(512),
    post_process: bool = Form(False),
    high_end_process: bool = Form(False),
    segment_size: int = Form(256),
    overlap: float | None = Form(None),
    use_gpu: bool | None = Form(None),
):
    opts = SeparationOptions(
        arch=arch,
        model_name=model_name,
        primary_stem_only=primary_stem_only,
        secondary_stem_only=secondary_stem_only,
        output_format=output_format,
        normalization=normalization,
        denoise=denoise,
        semitone_shift=semitone_shift,
        aggression=aggression,
        tta=tta,
        window_size=window_size,
        post_process=post_process,
        high_end_process=high_end_process,
        segment_size=segment_size,
        overlap=overlap,
        use_gpu=use_gpu,
    )

    job = store.create(
        "separation",
        input_filename=file.filename,
        options=opts.model_dump(mode="json"),
        message="Queued",
    )

    # Persist the upload before returning (UploadFile is closed after response).
    safe_name = os.path.basename(file.filename or "input")
    audio_path = os.path.join(UPLOAD_DIR, f"{job.id}_{safe_name}")
    with open(audio_path, "wb") as out:
        shutil.copyfileobj(file.file, out)

    export_path = os.path.join(JOBS_DIR, job.id)

    def _task(j):
        outputs = run_separation(audio_path, export_path, opts, j)
        j.update(outputs=outputs, message="Done")

    store.submit(job, _task)
    return job.to_info()


@app.get("/api/jobs", response_model=list[JobInfo])
def list_jobs():
    return [j.to_info() for j in store.list()]


@app.get("/api/jobs/{job_id}", response_model=JobInfo)
def get_job(job_id: str):
    job = store.get(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    return job.to_info()


@app.get("/api/jobs/{job_id}/files/{filename}")
def get_job_file(job_id: str, filename: str):
    safe = os.path.basename(filename)
    path = os.path.join(JOBS_DIR, job_id, safe)
    if not os.path.isfile(path):
        raise HTTPException(404, "File not found")
    return FileResponse(path, filename=safe)
