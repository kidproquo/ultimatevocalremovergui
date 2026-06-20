# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Ultimate Vocal Remover GUI (UVR) v5.6 is a Tkinter desktop application for AI audio source separation (removing/isolating vocals, instrumentals, drums, bass, etc.). It wraps several neural-network architectures (VR Arch, MDX-Net, MDX23C, Demucs v1–v4) behind a single GUI. Python 3.9 is the target runtime.

## Running & Setup

```bash
pip install -r requirements.txt          # or: ./install_packages.sh (installs line-by-line, tolerant of failures)
python UVR.py                             # launches the GUI (the only entry point)
```

There is also a headless **web service** (FastAPI API + React/MUI/Vite UI +
Docker Compose) under `api/` and `web/` — see `API_README.md`. `docker compose
up --build` serves the UI on `:8080`. The API reuses the GUI's separation
engines unchanged; see the "Web service layer" section below.

GPU acceleration:
- NVIDIA CUDA: `pip install --upgrade torch --extra-index-url https://download.pytorch.org/whl/cu117`
- Mac M1+ uses MPS automatically. Detection lives in `separate.py` (`cuda_available`, `mps_available`).

External binaries expected on PATH or in the app directory: **ffmpeg** (audio I/O) and **rubberband** (Time Stretch / Change Pitch tools).

There is **no test suite, linter config, or build script** in this repo. Distribution builds are produced externally via PyInstaller installers (see README). When `sys.frozen` is set, `BASE_PATH` resolves to the PyInstaller `_MEIPASS` dir instead of the source dir.

## Architecture

The codebase is two large files plus supporting libraries. There is no package structure — everything keys off the working directory, which `UVR.py` `os.chdir`'s to `BASE_PATH` at startup.

### `UVR.py` (~7200 lines) — GUI + orchestration
- `MainWindow` (subclasses `TkinterDnD.Tk`): the entire UI, all settings variables, the model menus, download manager, and process orchestration. The `if __name__ == "__main__"` block instantiates it and calls `mainloop()`.
- `ModelData`: resolves a selected model name into everything the separator needs — architecture type, stem names, hashes, per-model hyperparameters pulled from JSON in `models/*/model_data/`. **This is the central glue object** between the GUI and `separate.py`; both files depend on its shape.
- `Ensembler`: combines outputs of multiple models (spectrogram max/min/avg, audio average) per the ensemble settings.
- `AudioTools`: the non-separation utilities (Manual Ensemble, Time Stretch, Change Pitch, Align Inputs, Match Inputs/matchering).
- Processing runs **off the UI thread** via `KThread` (`kthread`) so it can be interrupted; `process_start` → builds `process_data` dict → constructs the right `Seperate*` class → progress/console is marshaled back to the UI through `ThreadSafeConsole`.

### `separate.py` (~1450 lines) — inference engines
- `SeperateAttributes`: base class holding shared inference state (mix loading, STFT params, GPU device, secondary-model chaining, progress callbacks).
- One subclass per architecture: `SeperateVR`, `SeperateMDX`, `SeperateMDXC` (MDX23C), `SeperateDemucs`. `UVR.py` picks the subclass based on `ModelData` flags (e.g. `is_mdx_c`).
- Secondary / chained model support: `process_secondary_model`, `process_chain_model` let one model's output feed another.
- Utility functions used by both files: `prepare_mix`, `save_format`, `clear_gpu_cache`, `pitch_shift`, `vr_denoiser`, `loading_mix`.

### Supporting libraries
- `lib_v5/` — the actual model code and DSP: `vr_network/` (VR architecture nets + per-model `modelparams/*.json` band configs), `mdxnet.py`, `tfc_tdf_v3.py` (MDX23C net + STFT), `spec_utils.py` (spectrogram/ensemble math — heavily used), `pyrb.py` (rubberband wrapper).
- `demucs/` — a vendored copy of the Demucs library (v1–v4 model definitions, `apply.py`, `pretrained.py`).
- `gui_data/` — non-code app data and GUI helpers: `constants.py` (**all the magic strings/architecture-type constants — read this first when touching model logic**), `sv_ttk` (theme), `tkinterdnd2` (drag-and-drop), fonts/images, saved settings/ensembles, `model_manual_download.json`.
- `models/` — downloaded model weights, organized by arch (`VR_Models/`, `MDX_Net_Models/`, `Demucs_Models/`). Each has a `model_data/` dir of JSON keyed by model hash that `ModelData` reads. Most weights are downloaded at runtime, not committed.

### Conventions to know
- Architecture types and process methods are string constants in `gui_data/constants.py` (`VR_ARCH_TYPE`, `MDX_ARCH_TYPE`, `DEMUCS_ARCH_TYPE`, `ENSEMBLE_MODE`, `PROCESS_METHODS`, etc.). Compare/branch against these constants, not raw literals.
- Model hyperparameters are **data, not code**: they live in the `model_data/*.json` files and the `lib_v5/vr_network/modelparams/*.json` band definitions. Adding model support usually means adding JSON + a hash entry, not new classes.
- "Seperate" (misspelled) is the established spelling for the separator class names throughout the codebase — match it when referencing them.
- DirectML (AMD/Intel GPU) support exists only as commented-out code; the shipped DirectML build is a separate beta.

## Web service layer (`api/` + `web/`)

A headless HTTP API and React UI that reuse the desktop engines **without
modification**. Key idea: `ModelData` (UVR.py) and the `Seperate*` engines read
every setting off a global Tkinter `root` window. `api/headless.py` provides a
duck-typed `HeadlessRoot` (supplying `root.<name>_var.get()` settings + the few
helper methods `ModelData` calls) and injects it as `UVR.root`. So the engines
run unchanged — no fork of ~400 lines of config logic.

- `api/headless.py` — `HeadlessRoot` + `DEFAULT_SETTINGS` (mirror the GUI's
  defaults; request fields override). **Start here when adding a tunable**: add
  the setting and map a request field to it.
- `api/separation.py` — lazily imports UVR/separate (heavy: pulls torch), builds
  `ModelData` + `process_data` (with progress/console callbacks that push onto a
  Job), picks the right `Seperate*` subclass, runs it, collects output files.
- `api/registry.py` — model catalog from `gui_data/model_manual_download.json`;
  download-on-demand from UVR's public repos, then refreshes hash/param mappers
  so new weights are recognized.
- `api/jobs.py` — in-memory job store + a single worker thread (separation is
  serialized; CPU/RAM heavy). `api/main.py` — FastAPI routes. `api/schemas.py` —
  pydantic models.

Gotchas worth knowing (all handled, don't re-discover the hard way):
- A model has **two identifiers**: `name` (file basename, used for separation)
  and `download_name` (friendly catalog name, used for downloading). For MDX
  these differ (`UVR-MDX-NET-Inst_HQ_1` vs `UVR-MDX-NET Inst HQ 1`).
- `UVR.py` and the vendored `demucs/{apply,utils}.py` `import tkinter` at module
  load (never rendered). The Docker image therefore uses Debian's distro Python
  + `python3-tk` rather than the official `python:*` images, which lack the
  `_tkinter` extension.
- `requirements.txt` needs `python3-dev`+a C toolchain (diffq builds a C ext) and
  a **matched** `torch`/`torchvision` CPU pair (a mismatched transitively-pulled
  torchvision breaks `import torchvision.ops`). Both are pinned in `Dockerfile.api`.
- Scope is single-model separation only (no ensemble / audio tools); CPU-only;
  no auth. See `API_README.md`.
