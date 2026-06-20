import { useCallback, useEffect, useState } from "react";
import {
  AppBar,
  Box,
  Container,
  Grid,
  Toolbar,
  Typography,
} from "@mui/material";
import GraphicEqIcon from "@mui/icons-material/GraphicEq";
import { api } from "./api";
import type { JobInfo, ModelInfo } from "./types";
import { SeparationForm } from "./components/SeparationForm";
import { JobsPanel } from "./components/JobsPanel";

export function App() {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [jobs, setJobs] = useState<JobInfo[]>([]);

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
    } catch (e) {
      console.error("Failed to load jobs", e);
    }
  }, []);

  useEffect(() => {
    refreshModels();
    refreshJobs();
    const t = setInterval(refreshJobs, 2000);
    return () => clearInterval(t);
  }, [refreshModels, refreshJobs]);

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
        </Toolbar>
      </AppBar>

      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Grid container spacing={3}>
          <Grid item xs={12} md={5}>
            <SeparationForm
              models={models}
              onModelsChanged={refreshModels}
              onJobCreated={refreshJobs}
            />
          </Grid>
          <Grid item xs={12} md={7}>
            <JobsPanel jobs={jobs} />
          </Grid>
        </Grid>
      </Container>
    </Box>
  );
}
