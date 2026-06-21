"""FastAPI application exposing UVR separation as a web service."""
from __future__ import annotations

import os
import shutil
import uuid

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from . import registry
from .jobs import store
from .schemas import (
    Arch,
    DownloadRequest,
    InputInfo,
    JobInfo,
    ModelInfo,
    OutputFormat,
    SeparationOptions,
    StorageInfo,
)
from .separation import run_separation

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.environ.get("UVR_DATA_DIR", os.path.join(REPO_ROOT, "data"))
UPLOAD_DIR = os.path.join(DATA_DIR, "uploads")  # legacy per-job uploads (pre-inputs)
INPUTS_DIR = os.path.join(DATA_DIR, "inputs")  # reusable, persistent input files
JOBS_DIR = os.path.join(DATA_DIR, "jobs")
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(INPUTS_DIR, exist_ok=True)
os.makedirs(JOBS_DIR, exist_ok=True)

# Persist job records to the data volume and recover prior history on startup so
# the files list survives restarts/rebuilds.
store.set_persist_dir(JOBS_DIR)
store.load_from_disk()

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


# --- Reusable input files ---------------------------------------------------
# An input is a single audio file under INPUTS_DIR/<id>/<filename>. It persists
# independently of jobs so one upload can feed many separations.

def _input_resolve(input_id: str):
    """Return (path, filename) for an input id, or None."""
    d = os.path.join(INPUTS_DIR, os.path.basename(input_id))
    if not os.path.isdir(d):
        return None
    files = [f for f in os.listdir(d) if os.path.isfile(os.path.join(d, f))]
    if not files:
        return None
    return os.path.join(d, files[0]), files[0]


def _input_info(input_id: str) -> InputInfo | None:
    resolved = _input_resolve(input_id)
    if not resolved:
        return None
    path, filename = resolved
    st = os.stat(path)
    return InputInfo(id=input_id, filename=filename, bytes=st.st_size, created_at=st.st_mtime)


def _save_input(file: UploadFile) -> InputInfo:
    input_id = uuid.uuid4().hex[:12]
    d = os.path.join(INPUTS_DIR, input_id)
    os.makedirs(d, exist_ok=True)
    safe_name = os.path.basename(file.filename or "input")
    with open(os.path.join(d, safe_name), "wb") as out:
        shutil.copyfileobj(file.file, out)
    return _input_info(input_id)  # type: ignore[return-value]


@app.get("/api/inputs", response_model=list[InputInfo])
def list_inputs():
    infos = [_input_info(e.name) for e in os.scandir(INPUTS_DIR) if e.is_dir()]
    return sorted((i for i in infos if i), key=lambda i: i.created_at, reverse=True)


@app.post("/api/inputs", response_model=InputInfo)
async def upload_input(file: UploadFile = File(...)):
    return _save_input(file)


@app.delete("/api/inputs/{input_id}")
def delete_input(input_id: str):
    d = os.path.join(INPUTS_DIR, os.path.basename(input_id))
    if not os.path.isdir(d):
        raise HTTPException(404, "Input not found")
    shutil.rmtree(d, ignore_errors=True)
    return {"deleted": input_id}


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
    file: UploadFile | None = File(None),
    input_id: str | None = Form(None),
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
    shifts: int = Form(2),
    demucs_segment: int | None = Form(None),
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
        shifts=shifts,
        demucs_segment=demucs_segment,
        use_gpu=use_gpu,
    )

    # Resolve the audio source: reuse a saved input, or save a new upload as a
    # reusable input (so it's retained for further jobs). The input is NOT tied
    # to the job — deleting the job leaves the input in place.
    if input_id:
        resolved = _input_resolve(input_id)
        if not resolved:
            raise HTTPException(404, f"Input '{input_id}' not found")
        audio_path, input_filename = resolved
    elif file is not None:
        info = _save_input(file)
        resolved = _input_resolve(info.id)
        audio_path, input_filename = resolved  # type: ignore[misc]
    else:
        raise HTTPException(400, "Provide either a file upload or an input_id")

    job = store.create(
        "separation",
        input_filename=input_filename,
        options=opts.model_dump(mode="json"),
        message="Queued",
    )

    export_path = os.path.join(JOBS_DIR, job.id)

    def _task(j):
        outputs = run_separation(audio_path, export_path, opts, j)
        j.update(outputs=outputs, message="Done")

    store.submit(job, _task)
    return job.to_info()


def _dir_size(path: str) -> int:
    total = 0
    if os.path.isdir(path):
        for entry in os.scandir(path):
            try:
                if entry.is_file():
                    total += entry.stat().st_size
            except OSError:
                pass
    return total


def _upload_files(job_id: str) -> list[str]:
    prefix = f"{job_id}_"
    if not os.path.isdir(UPLOAD_DIR):
        return []
    return [
        os.path.join(UPLOAD_DIR, f)
        for f in os.listdir(UPLOAD_DIR)
        if f.startswith(prefix)
    ]


def _tree_size(path: str) -> int:
    total = 0
    for root, _dirs, files in os.walk(path):
        for f in files:
            try:
                total += os.path.getsize(os.path.join(root, f))
            except OSError:
                pass
    return total


def _job_bytes(job_id: str) -> int:
    """Disk used by a job: its output files (minus job.json) + any legacy
    per-job upload. Reusable inputs are shared and accounted separately."""
    out = _dir_size(os.path.join(JOBS_DIR, job_id))
    meta = os.path.join(JOBS_DIR, job_id, "job.json")
    if os.path.isfile(meta):
        out -= os.path.getsize(meta)
    inp = sum(os.path.getsize(f) for f in _upload_files(job_id) if os.path.isfile(f))
    return max(0, out) + inp


def _with_bytes(info: JobInfo) -> JobInfo:
    info.bytes = _job_bytes(info.id)
    return info


@app.get("/api/jobs", response_model=list[JobInfo])
def list_jobs():
    return [_with_bytes(j.to_info()) for j in store.list()]


@app.get("/api/storage", response_model=StorageInfo)
def storage():
    jobs = store.list()
    # Inputs: reusable inputs + any legacy per-job uploads.
    inputs = _tree_size(INPUTS_DIR) + _tree_size(UPLOAD_DIR)
    outputs = 0
    for j in jobs:
        d = _dir_size(os.path.join(JOBS_DIR, j.id))
        meta = os.path.join(JOBS_DIR, j.id, "job.json")
        if os.path.isfile(meta):
            d -= os.path.getsize(meta)
        outputs += max(0, d)
    return StorageInfo(
        total_bytes=inputs + outputs,
        uploads_bytes=inputs,
        outputs_bytes=outputs,
        job_count=len(jobs),
    )


@app.get("/api/jobs/{job_id}", response_model=JobInfo)
def get_job(job_id: str):
    job = store.get(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    return _with_bytes(job.to_info())


@app.delete("/api/jobs/{job_id}")
def delete_job(job_id: str):
    job = store.get(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    # Remove output dir (includes the persisted job.json) and the input upload.
    shutil.rmtree(os.path.join(JOBS_DIR, job_id), ignore_errors=True)
    for f in _upload_files(job_id):
        try:
            os.remove(f)
        except OSError:
            pass
    store.delete(job_id)
    return {"deleted": job_id}


@app.get("/api/jobs/{job_id}/files/{filename}")
def get_job_file(job_id: str, filename: str):
    safe = os.path.basename(filename)
    path = os.path.join(JOBS_DIR, job_id, safe)
    if not os.path.isfile(path):
        raise HTTPException(404, "File not found")
    return FileResponse(path, filename=safe)
