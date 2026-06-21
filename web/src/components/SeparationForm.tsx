import { useMemo, useState } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Divider,
  FormControl,
  FormControlLabel,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import DownloadIcon from "@mui/icons-material/Download";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import TuneIcon from "@mui/icons-material/Tune";
import { api } from "../api";
import type { Arch, ModelInfo } from "../types";

const ARCHS: { value: Arch; label: string }[] = [
  { value: "mdx", label: "MDX-Net" },
  { value: "vr", label: "VR Arch" },
  { value: "demucs", label: "Demucs" },
];

const FORMATS = ["WAV", "FLAC", "MP3"];
const WINDOW_SIZES = [320, 512, 1024];

interface Props {
  models: ModelInfo[];
  onModelsChanged: () => void;
  onJobCreated: () => void;
}

export function SeparationForm({ models, onModelsChanged, onJobCreated }: Props) {
  const [arch, setArch] = useState<Arch>("mdx");
  const [modelName, setModelName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [format, setFormat] = useState("WAV");
  const [primaryOnly, setPrimaryOnly] = useState(false);
  const [secondaryOnly, setSecondaryOnly] = useState(false);
  const [normalization, setNormalization] = useState(false);
  const [denoise, setDenoise] = useState(false);

  // Advanced — shared
  const [pitchShift, setPitchShift] = useState("0");
  const [overlap, setOverlap] = useState(""); // "" => Default (MDX & Demucs)
  // Advanced — MDX
  const [segmentSize, setSegmentSize] = useState("256");
  // Advanced — VR
  const [aggression, setAggression] = useState("10");
  const [windowSize, setWindowSize] = useState("512");
  const [tta, setTta] = useState(false);
  const [postProcess, setPostProcess] = useState(false);
  const [highEnd, setHighEnd] = useState(false);
  // Advanced — Demucs
  const [shifts, setShifts] = useState("2");
  const [demucsSegment, setDemucsSegment] = useState(""); // "" => Default

  const [submitting, setSubmitting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const archModels = useMemo(
    () => models.filter((m) => m.arch === arch),
    [models, arch]
  );
  const selected = archModels.find((m) => m.name === modelName);

  const submit = async () => {
    setError(null);
    if (!file) return setError("Choose an audio file first.");
    if (!modelName) return setError("Choose a model.");
    if (!selected?.installed)
      return setError("Model is not installed — download it first.");

    setSubmitting(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("arch", arch);
      form.append("model_name", modelName);
      form.append("output_format", format);
      form.append("primary_stem_only", String(primaryOnly));
      form.append("secondary_stem_only", String(secondaryOnly));
      form.append("normalization", String(normalization));
      form.append("denoise", String(denoise));
      form.append("semitone_shift", pitchShift || "0");

      // Only send the params that apply to the chosen architecture, so the
      // recorded job settings reflect what actually took effect.
      if (arch === "mdx") {
        form.append("segment_size", segmentSize || "256");
        if (overlap !== "") form.append("overlap", overlap);
      } else if (arch === "vr") {
        form.append("aggression", aggression || "10");
        form.append("window_size", windowSize);
        form.append("tta", String(tta));
        form.append("post_process", String(postProcess));
        form.append("high_end_process", String(highEnd));
      } else if (arch === "demucs") {
        form.append("shifts", shifts || "2");
        if (overlap !== "") form.append("overlap", overlap);
        if (demucsSegment !== "") form.append("demucs_segment", demucsSegment);
      }

      await api.separate(form);
      onJobCreated();
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setSubmitting(false);
    }
  };

  const download = async () => {
    if (!selected) return;
    setDownloading(true);
    setError(null);
    try {
      await api.downloadModel(arch, selected.download_name);
      // Poll models until it shows installed (download runs as a job).
      const started = Date.now();
      const t = setInterval(async () => {
        onModelsChanged();
        if (Date.now() - started > 1000 * 60 * 10) clearInterval(t);
      }, 3000);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setDownloading(false);
    }
  };

  const num = (label: string, value: string, setter: (v: string) => void, props = {}) => (
    <TextField
      label={label}
      type="number"
      size="small"
      value={value}
      onChange={(e) => setter(e.target.value)}
      fullWidth
      {...props}
    />
  );

  return (
    <Card>
      <CardContent>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2 }}>
          New separation
        </Typography>

        <Stack spacing={2}>
          <FormControl fullWidth size="small">
            <InputLabel>Architecture</InputLabel>
            <Select
              label="Architecture"
              value={arch}
              onChange={(e) => {
                setArch(e.target.value as Arch);
                setModelName("");
              }}
            >
              {ARCHS.map((a) => (
                <MenuItem key={a.value} value={a.value}>
                  {a.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
            <FormControl fullWidth size="small">
              <InputLabel>Model</InputLabel>
              <Select
                label="Model"
                value={modelName}
                onChange={(e) => setModelName(e.target.value)}
              >
                {archModels.map((m) => (
                  <MenuItem key={m.name} value={m.name}>
                    {m.installed ? "● " : "○ "}
                    {m.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Tooltip title={selected?.installed ? "Installed" : "Download model"}>
              <span>
                <IconButton
                  color="secondary"
                  disabled={!modelName || selected?.installed || downloading}
                  onClick={download}
                >
                  {downloading ? <CircularProgress size={20} /> : <DownloadIcon />}
                </IconButton>
              </span>
            </Tooltip>
          </Box>

          <Button
            component="label"
            variant="outlined"
            startIcon={<UploadFileIcon />}
            sx={{ justifyContent: "flex-start" }}
          >
            {file ? file.name : "Choose audio file"}
            <input
              hidden
              type="file"
              accept="audio/*,.wav,.mp3,.flac,.m4a,.ogg"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </Button>

          <FormControl fullWidth size="small">
            <InputLabel>Output format</InputLabel>
            <Select
              label="Output format"
              value={format}
              onChange={(e) => setFormat(e.target.value)}
            >
              {FORMATS.map((f) => (
                <MenuItem key={f} value={f}>
                  {f}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <Divider flexItem />

          <Stack>
            <FormControlLabel
              control={
                <Switch checked={primaryOnly} onChange={(e) => setPrimaryOnly(e.target.checked)} />
              }
              label="Primary stem only"
            />
            <FormControlLabel
              control={
                <Switch checked={secondaryOnly} onChange={(e) => setSecondaryOnly(e.target.checked)} />
              }
              label="Secondary stem only"
            />
            <FormControlLabel
              control={
                <Switch checked={normalization} onChange={(e) => setNormalization(e.target.checked)} />
              }
              label="Normalize output"
            />
            <FormControlLabel
              control={<Switch checked={denoise} onChange={(e) => setDenoise(e.target.checked)} />}
              label="Denoise"
            />
          </Stack>

          {/* Arch-aware advanced parameters */}
          <Accordion disableGutters elevation={0} sx={{ bgcolor: "transparent", "&:before": { display: "none" } }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ px: 0 }}>
              <TuneIcon fontSize="small" sx={{ mr: 1, color: "text.secondary" }} />
              <Typography variant="body2" sx={{ color: "text.secondary" }}>
                Advanced ({ARCHS.find((a) => a.value === arch)?.label} settings)
              </Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ px: 0 }}>
              <Stack spacing={2}>
                {arch === "mdx" && (
                  <>
                    {num("Segment size", segmentSize, setSegmentSize, { inputProps: { min: 32, step: 32 } })}
                    {num("Overlap (blank = default)", overlap, setOverlap, {
                      inputProps: { min: 0, max: 0.99, step: 0.05 },
                      placeholder: "Default",
                    })}
                  </>
                )}

                {arch === "vr" && (
                  <>
                    {num("Aggression (0–100)", aggression, setAggression, { inputProps: { min: 0, max: 100 } })}
                    <FormControl fullWidth size="small">
                      <InputLabel>Window size</InputLabel>
                      <Select label="Window size" value={windowSize} onChange={(e) => setWindowSize(e.target.value)}>
                        {WINDOW_SIZES.map((w) => (
                          <MenuItem key={w} value={String(w)}>
                            {w}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                    <FormControlLabel
                      control={<Switch checked={tta} onChange={(e) => setTta(e.target.checked)} />}
                      label="TTA (test-time augmentation)"
                    />
                    <FormControlLabel
                      control={<Switch checked={postProcess} onChange={(e) => setPostProcess(e.target.checked)} />}
                      label="Post-process"
                    />
                    <FormControlLabel
                      control={<Switch checked={highEnd} onChange={(e) => setHighEnd(e.target.checked)} />}
                      label="High-end process"
                    />
                  </>
                )}

                {arch === "demucs" && (
                  <>
                    {num("Shifts", shifts, setShifts, { inputProps: { min: 0, max: 10 } })}
                    {num("Overlap (blank = default)", overlap, setOverlap, {
                      inputProps: { min: 0, max: 0.99, step: 0.05 },
                      placeholder: "Default",
                    })}
                    {num("Segment (blank = default)", demucsSegment, setDemucsSegment, {
                      inputProps: { min: 1 },
                      placeholder: "Default",
                    })}
                  </>
                )}

                {num("Pitch shift (semitones)", pitchShift, setPitchShift, { inputProps: { step: 1 } })}

                <Typography variant="caption" color="text.secondary">
                  Compute device is auto-detected (GPU when available, else CPU) and
                  shown in the header — there's no manual toggle, since you'd
                  always want the GPU when one is present.
                </Typography>
              </Stack>
            </AccordionDetails>
          </Accordion>

          {error && <Alert severity="error">{error}</Alert>}

          <Button
            variant="contained"
            size="large"
            disabled={submitting}
            onClick={submit}
            startIcon={submitting ? <CircularProgress size={18} /> : undefined}
          >
            {submitting ? "Submitting…" : "Separate"}
          </Button>
        </Stack>
      </CardContent>
    </Card>
  );
}
