import {
  Box,
  Card,
  CardContent,
  Chip,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from "@mui/material";
import SpeedIcon from "@mui/icons-material/Speed";
import type { StatsInfo } from "../types";

// Per-host processing performance, accumulated over time: how long each model
// takes per MB of input on this machine's device. Useful for comparing models
// and (later) CPU vs GPU hosts.
export function StatsPanel({ stats }: { stats: StatsInfo | null }) {
  const rows = stats?.rows ?? [];
  return (
    <Card>
      <CardContent>
        <Stack direction="row" alignItems="center" sx={{ mb: 1.5 }} spacing={1}>
          <SpeedIcon fontSize="small" color="secondary" />
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            Processing performance
          </Typography>
          <Box flexGrow={1} />
          {stats && (
            <Chip size="small" variant="outlined" label={`host: ${stats.host_device.toUpperCase()}`} />
          )}
        </Stack>

        {rows.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No completed separations yet. Run a job to start tracking time per MB.
          </Typography>
        ) : (
          <Box sx={{ overflowX: "auto" }}>
          <Table size="small" sx={{ minWidth: 360 }}>
            <TableHead>
              <TableRow>
                <TableCell>Model</TableCell>
                <TableCell align="center">Device</TableCell>
                <TableCell align="right">
                  <Tooltip title="Completed runs (failed/cancelled in red)">
                    <span>Runs</span>
                  </Tooltip>
                </TableCell>
                <TableCell align="right">
                  <Tooltip title="Avg processing seconds per minute of audio on full runs (lower = faster; format-independent)">
                    <span>s / min</span>
                  </Tooltip>
                </TableCell>
                <TableCell align="right">
                  <Tooltip title="Peak memory — average (worst-case)">
                    <span>Peak mem</span>
                  </Tooltip>
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={`${r.model}|${r.device}`}>
                  <TableCell sx={{ maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    <Tooltip title={`${r.model} (${r.arch.toUpperCase()})`}>
                      <span>{r.model}</span>
                    </Tooltip>
                  </TableCell>
                  <TableCell align="center">
                    <Chip size="small" label={r.device.toUpperCase()} variant="outlined" sx={{ height: 20, fontSize: 11 }} />
                  </TableCell>
                  <TableCell align="right">
                    {r.completed}
                    {r.failed + r.cancelled > 0 && (
                      <Tooltip title={`${r.failed} failed, ${r.cancelled} cancelled`}>
                        <Box component="span" sx={{ color: "error.main", ml: 0.5 }}>
                          (+{r.failed + r.cancelled})
                        </Box>
                      </Tooltip>
                    )}
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>
                    <Tooltip title={r.total_audio_min > 0 ? `${r.total_audio_min.toFixed(1)} min processed` : ""}>
                      <span>{r.sec_per_audio_min > 0 ? r.sec_per_audio_min.toFixed(1) : "—"}</span>
                    </Tooltip>
                  </TableCell>
                  <TableCell align="right" sx={{ color: "text.secondary" }}>
                    {r.avg_peak_mb > 0
                      ? `${r.avg_peak_mb.toFixed(0)} (${r.max_peak_mb.toFixed(0)})`
                      : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
