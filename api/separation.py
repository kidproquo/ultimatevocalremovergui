"""Run a single-model separation headlessly.

Reuses the unmodified ``ModelData`` (UVR.py) and ``Seperate*`` engines
(separate.py) by injecting a :class:`~api.headless.HeadlessRoot` as ``UVR.root``.
"""
from __future__ import annotations

import importlib
import os
import re
import threading
from typing import Any

from .headless import HeadlessRoot
from .schemas import OutputFile, SeparationOptions

# Importing UVR runs heavy module-level code (and pulls torch/onnx). Do it once,
# lazily, behind a lock so concurrent first-calls don't race.
_uvr_lock = threading.Lock()
_uvr = None
_consts = None
_separate = None


def _patch_screeninfo():
    """``gui_data.app_size_values`` calls ``screeninfo.get_monitors()`` at import
    time to size the GUI window. With no display (headless/Docker) that raises
    "No enumerators available", which would abort importing UVR. Patch in a
    default monitor so the import succeeds — the value only affects GUI layout,
    which we never render."""
    import screeninfo

    original = screeninfo.get_monitors

    def safe_get_monitors(*args, **kwargs):
        try:
            monitors = original(*args, **kwargs)
            if monitors:
                return monitors
        except Exception:
            pass
        return [screeninfo.Monitor(x=0, y=0, width=1920, height=1080)]

    # app_size_values does `from screeninfo import get_monitors`, so patch the
    # module attribute BEFORE UVR (and thus that module) is imported below.
    screeninfo.get_monitors = safe_get_monitors


def _load_engine():
    global _uvr, _consts, _separate
    if _uvr is not None:
        return _uvr, _consts, _separate
    with _uvr_lock:
        if _uvr is None:
            _patch_screeninfo()
            _consts = importlib.import_module("gui_data.constants")
            _separate = importlib.import_module("separate")
            _uvr = importlib.import_module("UVR")
    return _uvr, _consts, _separate


_ARCH_TO_METHOD = {"vr": "VR_ARCH_TYPE", "mdx": "MDX_ARCH_TYPE", "demucs": "DEMUCS_ARCH_TYPE"}


def _build_overrides(opts: SeparationOptions) -> dict[str, Any]:
    """Translate a request into ``HeadlessRoot`` setting overrides."""
    overrides: dict[str, Any] = {
        "is_normalization": opts.normalization,
        "is_primary_stem_only": opts.primary_stem_only,
        "is_secondary_stem_only": opts.secondary_stem_only,
        "is_primary_stem_only_Demucs": opts.primary_stem_only,
        "is_secondary_stem_only_Demucs": opts.secondary_stem_only,
        "save_format": opts.output_format.value,
        "semitone_shift": str(opts.semitone_shift),
        "denoise_option": "Standard" if opts.denoise else "None",
        # VR
        "aggression_setting": str(int(opts.aggression)),
        "is_tta": opts.tta,
        "window_size": str(int(opts.window_size)),
        "is_post_process": opts.post_process,
        "is_high_end_process": opts.high_end_process,
        # MDX
        "mdx_segment_size": str(int(opts.segment_size)),
    }
    if opts.overlap is not None:
        overrides["overlap"] = str(opts.overlap)
        overrides["overlap_mdx"] = str(opts.overlap)
        overrides["overlap_mdx23"] = str(opts.overlap)
    return overrides


def run_separation(audio_path: str, export_path: str, opts: SeparationOptions, job) -> list[OutputFile]:
    """Separate ``audio_path`` into stems written under ``export_path``.

    ``job`` is the :class:`api.jobs.Job`; we push progress/log onto it.
    Returns the list of produced output files.
    """
    uvr, consts, separate = _load_engine()

    # Inject the headless root so ModelData/engines read our settings.
    uvr.root = HeadlessRoot(overrides=_build_overrides(opts))

    method = getattr(consts, _ARCH_TO_METHOD[opts.arch.value])
    model = uvr.ModelData(opts.model_name, selected_process_method=method, is_dry_check=True)

    if not model.model_status:
        raise ValueError(
            f"Model '{opts.model_name}' ({opts.arch.value}) is not installed or its "
            f"parameters are unrecognized. Download it first via /api/models/download."
        )

    os.makedirs(export_path, exist_ok=True)
    audio_file_base = re.sub(r"\.[^.]+$", "", os.path.basename(audio_path))

    def set_progress_bar(step, inference_iterations=0.0):
        job.update(progress=max(0.0, min(0.99, float(step) + float(inference_iterations))))

    def write_to_console(text, base_text=""):
        job.append_log(f"{base_text}{text}")

    def cached_source_callback(_arch_type, model_name=None):
        return None, None

    def cached_model_source_holder(_arch_type, _sources, _basename=None):
        return None

    process_data = {
        "model_data": model,
        "export_path": export_path,
        "audio_file_base": audio_file_base,
        "audio_file": audio_path,
        "set_progress_bar": set_progress_bar,
        "write_to_console": write_to_console,
        "process_iteration": lambda: None,
        "cached_source_callback": cached_source_callback,
        "cached_model_source_holder": cached_model_source_holder,
        "list_all_models": [model.model_basename],
        "is_ensemble_master": False,
        "is_4_stem_ensemble": False,
    }

    before = set(os.listdir(export_path))

    if model.process_method == consts.VR_ARCH_TYPE:
        seperator = separate.SeperateVR(model, process_data)
    elif model.process_method == consts.MDX_ARCH_TYPE:
        seperator = (
            separate.SeperateMDXC(model, process_data)
            if model.is_mdx_c
            else separate.SeperateMDX(model, process_data)
        )
    elif model.process_method == consts.DEMUCS_ARCH_TYPE:
        seperator = separate.SeperateDemucs(model, process_data)
    else:
        raise ValueError(f"Unsupported process method: {model.process_method}")

    job.update(message=f"Separating with {model.model_basename}…")
    seperator.seperate()

    # Collect newly produced files (handles WAV/FLAC/MP3 naming uniformly).
    produced = sorted(set(os.listdir(export_path)) - before)
    outputs: list[OutputFile] = []
    stem_re = re.compile(r"_\(([^)]+)\)")
    for fname in produced:
        m = stem_re.search(fname)
        stem = m.group(1) if m else fname
        outputs.append(OutputFile(stem=stem, filename=fname, url=f"/api/jobs/{job.id}/files/{fname}"))
    return outputs
