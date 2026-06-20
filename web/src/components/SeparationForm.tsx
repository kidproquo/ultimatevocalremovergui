import { useMemo, useState } from "react";
import {
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
  Tooltip,
  Typography,
} from "@mui/material";
import DownloadIcon from "@mui/icons-material/Download";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import { api } from "../api";
import type { Arch, ModelInfo } from "../types";

const ARCHS: { value: Arch; label: string }[] = [
  { value: "mdx", label: "MDX-Net" },
  { value: "vr", label: "VR Arch" },
  { value: "demucs", label: "Demucs" },
];

const FORMATS = ["WAV", "FLAC", "MP3"];

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
                <Switch
                  checked={primaryOnly}
                  onChange={(e) => setPrimaryOnly(e.target.checked)}
                />
              }
              label="Primary stem only"
            />
            <FormControlLabel
              control={
                <Switch
                  checked={secondaryOnly}
                  onChange={(e) => setSecondaryOnly(e.target.checked)}
                />
              }
              label="Secondary stem only"
            />
            <FormControlLabel
              control={
                <Switch
                  checked={normalization}
                  onChange={(e) => setNormalization(e.target.checked)}
                />
              }
              label="Normalize output"
            />
            <FormControlLabel
              control={
                <Switch
                  checked={denoise}
                  onChange={(e) => setDenoise(e.target.checked)}
                />
              }
              label="Denoise"
            />
          </Stack>

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
