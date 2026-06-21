import { useEffect, useRef, useState } from "react";
import { Box, IconButton, Paper, Stack, Tooltip, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import PauseIcon from "@mui/icons-material/Pause";
import Forward10Icon from "@mui/icons-material/Forward10";
import Replay10Icon from "@mui/icons-material/Replay10";
import DownloadIcon from "@mui/icons-material/Download";
import CloseIcon from "@mui/icons-material/Close";
import WaveSurfer from "wavesurfer.js";
import type { NowPlaying } from "../types";

function fmt(s: number): string {
  if (!isFinite(s) || s < 0) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

// Single global player — a fixed bottom bar with a seekable waveform. Only one
// track plays at a time; selecting another replaces it.
export function MiniPlayer({ track, onClose }: { track: NowPlaying | null; onClose: () => void }) {
  const theme = useTheme();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const wsRef = useRef<WaveSurfer | null>(null);
  const [playing, setPlaying] = useState(false);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);
  const [loading, setLoading] = useState(false);
  // Object URL of the fetched blob — reused for both playback and download so
  // the file is pulled over the network exactly once.
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!track || !containerRef.current) return;
    let cancelled = false;
    let objectUrl: string | null = null;
    setLoading(true);
    setCur(0);
    setDur(0);
    setBlobUrl(null);

    // Fetch ONCE; wavesurfer v7 otherwise downloads the file twice (audio
    // element + waveform peaks). A local object URL serves both with no network.
    fetch(track.url)
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status}`);
        return r.blob();
      })
      .then((blob) => {
        if (cancelled || !containerRef.current) return;
        objectUrl = URL.createObjectURL(blob);
        setBlobUrl(objectUrl);
        const ws = WaveSurfer.create({
          container: containerRef.current,
          url: objectUrl,
          height: 40,
          waveColor: theme.palette.action.disabled,
          progressColor: theme.palette.primary.main,
          cursorColor: theme.palette.secondary.main,
          barWidth: 2,
          barGap: 1,
          barRadius: 2,
        });
        wsRef.current = ws;
        ws.on("ready", () => {
          setDur(ws.getDuration());
          setLoading(false);
          ws.play();
        });
        ws.on("timeupdate", (t: number) => setCur(t));
        ws.on("play", () => setPlaying(true));
        ws.on("pause", () => setPlaying(false));
        ws.on("finish", () => setPlaying(false));
        ws.on("error", () => setLoading(false));
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      if (wsRef.current) {
        wsRef.current.destroy();
        wsRef.current = null;
      }
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [track?.url]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!track) return null;
  const ws = () => wsRef.current;

  return (
    <Paper
      elevation={8}
      square
      sx={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: (t) => t.zIndex.drawer + 2,
        px: { xs: 1, sm: 2 },
        py: 1,
        borderTop: 1,
        borderColor: "divider",
      }}
    >
      <Stack direction="row" alignItems="center" spacing={{ xs: 0.5, sm: 1 }}>
        <Tooltip title="Rewind 10s">
          <IconButton size="small" onClick={() => ws()?.skip(-10)}>
            <Replay10Icon />
          </IconButton>
        </Tooltip>
        <IconButton color="primary" onClick={() => ws()?.playPause()} disabled={loading}>
          {playing ? <PauseIcon /> : <PlayArrowIcon />}
        </IconButton>
        <Tooltip title="Forward 10s">
          <IconButton size="small" onClick={() => ws()?.skip(10)}>
            <Forward10Icon />
          </IconButton>
        </Tooltip>

        <Box sx={{ minWidth: 0, flexGrow: 1 }}>
          <Typography variant="caption" noWrap sx={{ display: "block", color: "text.secondary" }}>
            {loading ? "Loading… " : ""}
            {track.label}
          </Typography>
          {/* Click the waveform to seek */}
          <Box ref={containerRef} sx={{ width: "100%", cursor: "pointer" }} />
        </Box>

        <Typography
          variant="caption"
          sx={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", display: { xs: "none", sm: "block" } }}
        >
          {fmt(cur)} / {fmt(dur)}
        </Typography>
        <Tooltip title="Download">
          <IconButton size="small" component="a" href={blobUrl ?? track.url} download={track.filename}>
            <DownloadIcon />
          </IconButton>
        </Tooltip>
        <Tooltip title="Close player">
          <IconButton size="small" onClick={() => { ws()?.pause(); onClose(); }}>
            <CloseIcon />
          </IconButton>
        </Tooltip>
      </Stack>
    </Paper>
  );
}
