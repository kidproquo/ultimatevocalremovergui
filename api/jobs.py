"""In-memory job store + a serial background worker.

Separation on CPU is heavy, so jobs run one-at-a-time on a single worker thread.
The store is process-local; for a multi-replica deployment this would move to
Redis/DB, but that is out of scope for the first cut.
"""
from __future__ import annotations

import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from typing import Callable, Optional

from .schemas import JobInfo, JobStatus, OutputFile

# Single worker => separation jobs are serialized. Bump for multi-GPU hosts.
_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="uvr-worker")


@dataclass
class Job:
    id: str
    kind: str
    status: str = JobStatus.queued.value
    progress: float = 0.0
    message: str = ""
    log: str = ""
    error: Optional[str] = None
    input_filename: Optional[str] = None
    options: Optional[dict] = None
    outputs: list = field(default_factory=list)  # list[OutputFile]
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)
    _lock: threading.Lock = field(default_factory=threading.Lock, repr=False)

    def update(self, **kwargs):
        with self._lock:
            for k, v in kwargs.items():
                setattr(self, k, v)
            self.updated_at = time.time()

    def append_log(self, text: str):
        with self._lock:
            # Mirror the GUI console: \r return-to-line-start is used for
            # progress; collapse it so the stored log stays readable.
            if text.startswith("\r"):
                head, _, _ = self.log.rpartition("\n")
                self.log = (head + "\n" if head else "") + text.lstrip("\r")
            else:
                self.log += text
            self.updated_at = time.time()

    def to_info(self) -> JobInfo:
        # Build manually (not dataclasses.asdict) to avoid deep-copying the Lock.
        with self._lock:
            outputs = [
                o if isinstance(o, OutputFile) else OutputFile(**o) for o in self.outputs
            ]
            return JobInfo(
                id=self.id,
                kind=self.kind,
                status=self.status,
                progress=self.progress,
                message=self.message,
                log=self.log,
                error=self.error,
                input_filename=self.input_filename,
                options=self.options,
                outputs=outputs,
                created_at=self.created_at,
                updated_at=self.updated_at,
            )


class JobStore:
    def __init__(self):
        self._jobs: dict[str, Job] = {}
        self._lock = threading.Lock()

    def create(self, kind: str, **fields) -> Job:
        job = Job(id=uuid.uuid4().hex[:12], kind=kind, **fields)
        with self._lock:
            self._jobs[job.id] = job
        return job

    def get(self, job_id: str) -> Optional[Job]:
        with self._lock:
            return self._jobs.get(job_id)

    def list(self) -> list[Job]:
        with self._lock:
            return sorted(self._jobs.values(), key=lambda j: j.created_at, reverse=True)

    def submit(self, job: Job, target: Callable[[Job], None]):
        """Run ``target(job)`` on the worker pool, tracking status/errors."""

        def _run():
            job.update(status=JobStatus.running.value)
            try:
                target(job)
                if job.status == JobStatus.running.value:
                    job.update(status=JobStatus.completed.value, progress=1.0)
            except Exception as exc:  # noqa: BLE001 - surface any engine error
                import traceback

                job.append_log("\n" + traceback.format_exc())
                job.update(status=JobStatus.failed.value, error=str(exc))

        _executor.submit(_run)


store = JobStore()
