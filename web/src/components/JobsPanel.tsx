import { useEffect, useState } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  IconButton,
  LinearProgress,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import DownloadIcon from "@mui/icons-material/Download";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import StorageIcon from "@mui/icons-material/Storage";
import ReplayIcon from "@mui/icons-material/Replay";
import StopCircleIcon from "@mui/icons-material/StopCircle";
import { api, apiUrl, humanBytes } from "../api";
import type { JobInfo, JobStatus, StorageInfo } from "../types";

const STATUS_COLOR: Record<JobStatus, "default" | "info" | "success" | "error" | "warning"> = {
  queued: "default",
  running: "info",
  completed: "success",
  failed: "error",
  cancelled: "warning",
};

function fmtSecs(s: number): string {
  if (s >= 60) return `${Math.floor(s / 60)}m${String(Math.round(s % 60)).padStart(2, "0")}s`;
  return `${s.toFixed(s < 10 ? 1 : 0)}s`;
}

// Render the settings a job used, from its persisted options. Only arch-relevant
// fields are shown, so it reflects what actually took effect (and survives log
// truncation, since options are stored in full).
function SettingsChips({ options }: { options: Record<string, unknown> }) {
  const o = options;
  const arch = String(o.arch ?? "");
  const stems = o.primary_stem_only
    ? "primary only"
    : o.secondary_stem_only
    ? "secondary only"
    : "both stems";

  const rows: [string, unknown][] = [
    ["model", o.model_name],
    ["arch", arch.toUpperCase()],
    ["format", o.output_format],
    ["stems", stems],
  ];
  if (o.normalization) rows.push(["normalized", "yes"]);
  if (o.denoise) rows.push(["denoise", "yes"]);
  if (Number(o.semitone_shift) !== 0) rows.push(["pitch", `${o.semitone_shift} st`]);

  if (arch === "mdx") {
    rows.push(["segment", o.segment_size]);
    rows.push(["overlap", o.overlap ?? "default"]);
  } else if (arch === "vr") {
    rows.push(["aggression", o.aggression]);
    rows.push(["window", o.window_size]);
    if (o.tta) rows.push(["TTA", "on"]);
    if (o.post_process) rows.push(["post-proc", "on"]);
    if (o.high_end_process) rows.push(["high-end", "on"]);
  } else if (arch === "demucs") {
    rows.push(["shifts", o.shifts]);
    rows.push(["overlap", o.overlap ?? "default"]);
    rows.push(["segment", o.demucs_segment ?? "default"]);
  }

  return (
    <Box sx={{ mb: 1.5 }}>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
        Settings used
      </Typography>
      <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
        {rows
          .filter(([, v]) => v !== undefined && v !== null && v !== "")
          .map(([k, v]) => (
            <Chip
              key={k}
              size="small"
              variant="outlined"
              label={`${k}: ${v}`}
              sx={{ fontSize: 11, height: 22 }}
            />
          ))}
      </Stack>
    </Box>
  );
}

function JobCard({
  job,
  onDeleted,
  onReuse,
}: {
  job: JobInfo;
  onDeleted: () => void;
  onReuse: (options: Record<string, unknown>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const active = job.status === "running" || job.status === "queued";
  const canReuse = job.kind === "separation" && !!job.options;

  // Live elapsed clock while the job is processing.
  const [nowSec, setNowSec] = useState(() => Date.now() / 1000);
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNowSec(Date.now() / 1000), 1000);
    return () => clearInterval(t);
  }, [active]);
  const elapsed =
    active && job.started_at ? Math.max(0, nowSec - job.started_at) : null;

  const del = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm("Delete this job and its files? This cannot be undone."))
      return;
    setDeleting(true);
    try {
      await api.deleteJob(job.id);
      onDeleted();
    } catch (err) {
      console.error("delete failed", err);
      setDeleting(false);
    }
  };

  const cancel = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api.cancelJob(job.id);
      onDeleted();
    } catch (err) {
      console.error("cancel failed", err);
    }
  };

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
            {elapsed != null ? (
              <Typography variant="caption" sx={{ color: "info.main", fontVariantNumeric: "tabular-nums" }}>
                ⏱ {fmtSecs(elapsed)}
                {job.device ? ` · ${job.device.toUpperCase()}` : ""}
              </Typography>
            ) : (
              job.duration_sec != null && (
                <Tooltip
                  title={
                    job.audio_seconds > 0
                      ? `${job.audio_seconds.toFixed(0)}s audio on ${(job.device || "cpu").toUpperCase()} · ${(
                          (job.duration_sec * 60) / job.audio_seconds
                        ).toFixed(1)} s/min`
                      : ""
                  }
                >
                  <Typography variant="caption" color="text.secondary">
                    {fmtSecs(job.duration_sec)}
                    {job.device ? ` · ${job.device.toUpperCase()}` : ""}
                  </Typography>
                </Tooltip>
              )
            )}
            {job.peak_mem_bytes > 0 && (
              <Tooltip title="Peak memory used by this job">
                <Typography variant="caption" color="text.secondary">
                  {humanBytes(job.peak_mem_bytes)} mem
                </Typography>
              </Tooltip>
            )}
            {job.bytes > 0 && (
              <Typography variant="caption" color="text.secondary">
                {humanBytes(job.bytes)}
              </Typography>
            )}
            <Typography variant="caption" color="text.secondary">
              {(job.options?.model_name as string) || ""}
            </Typography>
            {active && (
              <Tooltip title="Cancel job">
                <IconButton size="small" color="warning" onClick={cancel}>
                  <StopCircleIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
            {canReuse && (
              <Tooltip title="Reuse these settings in the form">
                <IconButton
                  size="small"
                  color="primary"
                  onClick={(e) => {
                    e.stopPropagation();
                    onReuse(job.options as Record<string, unknown>);
                  }}
                >
                  <ReplayIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
            <Tooltip title="Delete job + files">
              <span>
                <IconButton size="small" color="error" disabled={deleting || active} onClick={del}>
                  {deleting ? <CircularProgress size={16} /> : <DeleteOutlineIcon fontSize="small" />}
                </IconButton>
              </span>
            </Tooltip>
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

        {job.kind === "separation" && job.options && (
          <SettingsChips options={job.options} />
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
              // Terminal-style: dark bg + light text so it's readable in both themes.
              bgcolor: "#0b0d12",
              color: "#cbd5e1",
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

export function JobsPanel({
  jobs,
  storage,
  onChanged,
  onReuse,
}: {
  jobs: JobInfo[];
  storage: StorageInfo | null;
  onChanged: () => void;
  onReuse: (options: Record<string, unknown>) => void;
}) {
  return (
    <Card>
      <CardContent>
        <Stack direction="row" alignItems="center" sx={{ mb: 2 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            Jobs
          </Typography>
          <Box flexGrow={1} />
          {storage && (
            <Tooltip
              title={`Input ${humanBytes(storage.uploads_bytes)} · Output ${humanBytes(
                storage.outputs_bytes
              )} across ${storage.job_count} job(s)`}
            >
              <Chip
                icon={<StorageIcon />}
                size="small"
                variant="outlined"
                label={`${humanBytes(storage.total_bytes)} on disk`}
              />
            </Tooltip>
          )}
        </Stack>
        {jobs.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No jobs yet. Upload a file and hit Separate.
          </Typography>
        ) : (
          <Stack spacing={1}>
            {jobs.map((j) => (
              <JobCard key={j.id} job={j} onDeleted={onChanged} onReuse={onReuse} />
            ))}
          </Stack>
        )}
      </CardContent>
    </Card>
  );
}
