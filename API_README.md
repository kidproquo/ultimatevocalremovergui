# UVR Web Service (API + Web UI)

A headless HTTP API and React web UI wrapped around Ultimate Vocal Remover's
separation engines, plus a Docker Compose deployment.

This reuses the existing separation engines (`separate.py`) and model config
(`ModelData` in `UVR.py`) unchanged — a small "headless root"
(`api/headless.py`) stands in for the Tkinter window so the engines run without
a GUI. See [the architecture notes](#architecture).

## Quick start (Docker Compose)

CPU-only deployment:

```bash
docker compose up --build
```

Then open **http://localhost:8400**.

- The web UI (nginx) is bound to `127.0.0.1:8400` and proxies `/api/*` to the
  API service (which is not published — internal to the compose network).
- Model weights persist in `./models` (mounted into the API container).
- Job inputs/outputs persist in the `uvr-data` named volume.

### Serving behind a reverse proxy (subdomain or sub-path)

The SPA is built with a relative base (`base: "./"`) and derives its API base
from `document.baseURI`, so a single build works **both** at a domain root and
under a sub-path. This deployment is served at `https://dabba.princesamuel.me/uvr`
via Caddy:

```caddyfile
redir /uvr /uvr/ 301
handle_path /uvr/* {
    reverse_proxy localhost:8400 {
        flush_interval -1
    }
}
```

`handle_path` strips the `/uvr` prefix so nginx sees `/`, `/assets/*`, `/api/*`.
The `redir` adds the trailing slash so `document.baseURI` ends in `/` (otherwise
the API base would resolve one path level too high). To serve at a subdomain
root instead, just `reverse_proxy` to `localhost:8400` with no prefix stripping —
the same build works unchanged.

Workflow in the UI:
1. Pick an **architecture** (MDX-Net / VR Arch / Demucs) and a **model**.
2. If the model isn't installed (`○`), click the **download** button.
3. Choose an **audio file**, set options, and click **Separate**.
4. Watch progress in the **Jobs** panel and download the resulting stems.

## Run on the host (venv, no Docker)

```bash
python3 -m venv .venv
.venv/bin/pip install --index-url https://download.pytorch.org/whl/cpu torch
.venv/bin/pip install -r requirements.txt -r requirements-api.txt
.venv/bin/uvicorn api.main:app --host 0.0.0.0 --port 8000
```

`ffmpeg` must be installed for MP3/FLAC output. For the web UI in dev:

```bash
cd web && npm install && npm run dev     # http://localhost:5173, proxies /api -> :8000
```

## API

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/api/health` | Liveness check |
| `GET`  | `/api/models` | List catalog models (VR/MDX/Demucs) with `installed` flags |
| `POST` | `/api/models/download` | Download a model by `download_name`; returns a job |
| `POST` | `/api/separate` | Multipart upload + options; returns a separation job |
| `GET`  | `/api/jobs` | List all jobs (newest first) |
| `GET`  | `/api/jobs/{id}` | Job status, progress, log, outputs |
| `GET`  | `/api/jobs/{id}/files/{filename}` | Download an output stem |

Each model has two identifiers: `name` (the basename used for separation) and
`download_name` (the friendly catalog name used to download it). Use `name`
when calling `/api/separate` and `download_name` when calling
`/api/models/download`.

### Example

```bash
# Download a model
curl -X POST localhost:8000/api/models/download \
  -H 'Content-Type: application/json' \
  -d '{"arch":"mdx","name":"UVR-MDX-NET Inst HQ 3"}'

# Separate (after the download job completes)
curl -X POST localhost:8000/api/separate \
  -F file=@song.wav \
  -F arch=mdx \
  -F model_name=UVR-MDX-NET-Inst_HQ_3 \
  -F output_format=WAV

# Poll the job
curl localhost:8000/api/jobs/<job_id>
```

## Architecture

```
Browser ──> web (nginx :8080) ──/api──> api (uvicorn :8000)
                                            │
                                            ├─ api/main.py        FastAPI routes
                                            ├─ api/jobs.py         in-memory job store + 1 worker thread
                                            ├─ api/registry.py     model catalog + download-on-demand
                                            ├─ api/separation.py   builds ModelData + runs Seperate*
                                            └─ api/headless.py     fake Tkinter root (settings provider)
                                                     │
                                            UVR.py ModelData  +  separate.py Seperate{VR,MDX,MDXC,Demucs}
```

Key design points:
- **No fork of the engines.** `api/headless.py` injects a `HeadlessRoot` as
  `UVR.root`, supplying exactly the `*_var.get()` settings and helper methods
  that `ModelData` and the engines read. Defaults mirror the desktop app;
  request fields override them.
- **Jobs are serialized.** Separation is CPU/RAM heavy, so a single worker
  thread processes one job at a time (`ThreadPoolExecutor(max_workers=1)`).
  Progress and the engine's console output are streamed onto the job.
- **Download-on-demand.** Models come from UVR's public repos (catalog in
  `gui_data/model_manual_download.json`); after a download the hash/param
  mappers are refreshed so `ModelData` recognizes the new weights.

## Scope & limitations (first cut)

- **CPU-only**, single-model separation (VR / MDX-Net / Demucs). Ensemble mode
  and the audio tools (time-stretch, pitch, align, match) are not exposed.
- **No authentication** — intended for a trusted/local network or behind a
  separate proxy.
- **In-memory job store** — jobs are lost on API restart (output files persist
  on the volume). A multi-replica setup would need a shared store/queue.
