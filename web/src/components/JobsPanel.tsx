import { useState } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  LinearProgress,
  Stack,
  Typography,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import DownloadIcon from "@mui/icons-material/Download";
import { apiUrl } from "../api";
import type { JobInfo, JobStatus } from "../types";

const STATUS_COLOR: Record<JobStatus, "default" | "info" | "success" | "error"> = {
  queued: "default",
  running: "info",
  completed: "success",
  failed: "error",
};

function JobCard({ job }: { job: JobInfo }) {
  const [open, setOpen] = useState(false);
  const active = job.status === "running" || job.status === "queued";

  return (
    <Accordion
      expanded={open}
      onChange={() => setOpen((o) => !o)}
      disableGutters
      sx={{ bgcolor: "background.default" }}
    >
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Box sx={{ width: "100%" }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <Chip
              size="small"
              label={job.status}
              color={STATUS_COLOR[job.status]}
              variant="outlined"
            />
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {job.kind === "download"
                ? job.message
                : job.input_filename || job.id}
            </Typography>
            <Box flexGrow={1} />
            <Typography variant="caption" color="text.secondary">
              {(job.options?.model_name as string) || ""}
            </Typography>
          </Stack>
          {active && (
            <LinearProgress
              variant={job.progress > 0 ? "determinate" : "indeterminate"}
              value={Math.round(job.progress * 100)}
              sx={{ mt: 1 }}
            />
          )}
        </Box>
      </AccordionSummary>
      <AccordionDetails>
        {job.error && (
          <Typography variant="body2" color="error" sx={{ mb: 1 }}>
            {job.error}
          </Typography>
        )}

        {job.outputs.length > 0 && (
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 1 }}>
            {job.outputs.map((o) => (
              <Button
                key={o.filename}
                size="small"
                variant="outlined"
                startIcon={<DownloadIcon />}
                href={apiUrl(`jobs/${job.id}/files/${encodeURIComponent(o.filename)}`)}
              >
                {o.stem}
              </Button>
            ))}
          </Stack>
        )}

        {job.log && (
          <Box
            component="pre"
            sx={{
              m: 0,
              p: 1.5,
              maxHeight: 200,
              overflow: "auto",
              fontSize: 12,
              bgcolor: "#0b0d12",
              borderRadius: 1,
              whiteSpace: "pre-wrap",
            }}
          >
            {job.log}
          </Box>
        )}
      </AccordionDetails>
    </Accordion>
  );
}

export function JobsPanel({ jobs }: { jobs: JobInfo[] }) {
  return (
    <Card>
      <CardContent>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2 }}>
          Jobs
        </Typography>
        {jobs.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No jobs yet. Upload a file and hit Separate.
          </Typography>
        ) : (
          <Stack spacing={1}>
            {jobs.map((j) => (
              <JobCard key={j.id} job={j} />
            ))}
          </Stack>
        )}
      </CardContent>
    </Card>
  );
}
