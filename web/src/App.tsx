import { useCallback, useEffect, useState } from "react";
import {
  AppBar,
  Box,
  Chip,
  Container,
  Grid,
  Stack,
  Toolbar,
  Tooltip,
  Typography,
} from "@mui/material";
import GraphicEqIcon from "@mui/icons-material/GraphicEq";
import MemoryIcon from "@mui/icons-material/Memory";
import BoltIcon from "@mui/icons-material/Bolt";
import { api } from "./api";
import type {
  InputInfo,
  JobInfo,
  ModelInfo,
  StatsInfo,
  StorageInfo,
  SystemInfo,
} from "./types";
import { SeparationForm } from "./components/SeparationForm";
import { JobsPanel } from "./components/JobsPanel";
import { StatsPanel } from "./components/StatsPanel";

export function App() {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [jobs, setJobs] = useState<JobInfo[]>([]);
  const [inputs, setInputs] = useState<InputInfo[]>([]);
  const [system, setSystem] = useState<SystemInfo | null>(null);
  const [storage, setStorage] = useState<StorageInfo | null>(null);
  const [stats, setStats] = useState<StatsInfo | null>(null);
  // One-shot: settings lifted from a past job to prefill the form.
  const [preset, setPreset] = useState<Record<string, unknown> | null>(null);

  const refreshModels = useCallback(async () => {
    try {
      setModels(await api.listModels());
    } catch (e) {
      console.error("Failed to load models", e);
    }
  }, []);

  const refreshJobs = useCallback(async () => {
    try {
      setJobs(await api.listJobs());
      setStorage(await api.getStorage());
      setStats(await api.getStats());
    } catch (e) {
      console.error("Failed to load jobs", e);
    }
  }, []);

  const refreshInputs = useCallback(async () => {
    try {
      setInputs(await api.listInputs());
    } catch (e) {
      console.error("Failed to load inputs", e);
    }
  }, []);

  useEffect(() => {
    refreshModels();
    refreshJobs();
    refreshInputs();
    api.getSystem().then(setSystem).catch((e) => console.error("system info", e));
    const t = setInterval(refreshJobs, 2000);
    return () => clearInterval(t);
  }, [refreshModels, refreshJobs, refreshInputs]);

  // One job at a time: a separation is in flight when any is running/queued.
  const busyJob = jobs.find(
    (j) => j.kind === "separation" && (j.status === "running" || j.status === "queued")
  );

  const gpu = system?.gpu_available ?? false;
  const deviceLabel = system
    ? gpu
      ? `GPU · ${system.name || system.device.toUpperCase()}`
      : "CPU"
    : "…";
  const deviceTip = system
    ? `Separations run on ${system.device.toUpperCase()}` +
      (system.torch ? ` · torch ${system.torch}` : "") +
      ` · mode: ${system.mode}`
    : "Detecting compute device…";

  return (
    <Box sx={{ minHeight: "100vh" }}>
      <AppBar position="static" color="transparent" elevation={0}>
        <Toolbar>
          <GraphicEqIcon sx={{ mr: 1.5, color: "primary.main" }} />
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            Ultimate Vocal Remover
          </Typography>
          <Typography variant="body2" sx={{ ml: 1.5, color: "text.secondary" }}>
            web service
          </Typography>
          <Box flexGrow={1} />
          <Tooltip title={deviceTip}>
            <Chip
              icon={gpu ? <BoltIcon /> : <MemoryIcon />}
              label={deviceLabel}
              color={gpu ? "secondary" : "default"}
              variant={gpu ? "filled" : "outlined"}
              size="small"
            />
          </Tooltip>
        </Toolbar>
      </AppBar>

      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Grid container spacing={3}>
          <Grid item xs={12} md={5}>
            <Stack spacing={3}>
              <SeparationForm
                models={models}
                inputs={inputs}
                preset={preset}
                busy={!!busyJob}
                onPresetApplied={() => setPreset(null)}
                onModelsChanged={refreshModels}
                onInputsChanged={refreshInputs}
                onJobCreated={() => {
                  refreshJobs();
                  refreshInputs();
                }}
              />
              <StatsPanel stats={stats} />
            </Stack>
          </Grid>
          <Grid item xs={12} md={7}>
            <JobsPanel
              jobs={jobs}
              storage={storage}
              onChanged={refreshJobs}
              onReuse={setPreset}
            />
          </Grid>
        </Grid>
      </Container>
    </Box>
  );
}
