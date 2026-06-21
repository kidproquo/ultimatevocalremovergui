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
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Model</TableCell>
                <TableCell align="center">Device</TableCell>
                <TableCell align="right">Runs</TableCell>
                <TableCell align="right">
                  <Tooltip title="Average processing seconds per input MB (lower is faster)">
                    <span>s / MB</span>
                  </Tooltip>
                </TableCell>
                <TableCell align="right">Total</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={`${r.model}|${r.device}`}>
                  <TableCell sx={{ maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    <Tooltip title={`${r.model} (${r.arch.toUpperCase()})`}>
                      <span>{r.model}</span>
                    </Tooltip>
                  </TableCell>
                  <TableCell align="center">
                    <Chip size="small" label={r.device.toUpperCase()} variant="outlined" sx={{ height: 20, fontSize: 11 }} />
                  </TableCell>
                  <TableCell align="right">{r.runs}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>{r.sec_per_mb.toFixed(2)}</TableCell>
                  <TableCell align="right" sx={{ color: "text.secondary" }}>
                    {r.total_mb.toFixed(0)} MB / {r.total_sec.toFixed(0)}s
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
