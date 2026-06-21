export type Arch = "vr" | "mdx" | "demucs";

export interface SystemInfo {
  cuda: boolean;
  mps: boolean;
  name: string | null;
  torch: string | null;
  device: "cuda" | "mps" | "cpu";
  gpu_available: boolean;
  mode: string; // UVR_USE_GPU: auto | on | off
}

export interface ModelInfo {
  arch: Arch;
  name: string; // basename used for separation
  download_name: string; // friendly name used for downloading
  filename: string;
  installed: boolean;
}

export interface OutputFile {
  stem: string;
  filename: string;
  url: string;
}

export type JobStatus = "queued" | "running" | "completed" | "failed";

export interface JobInfo {
  id: string;
  kind: "separation" | "download";
  status: JobStatus;
  progress: number;
  message: string;
  log: string;
  error?: string | null;
  input_filename?: string | null;
  options?: Record<string, unknown> | null;
  outputs: OutputFile[];
  bytes: number;
  device?: string | null;
  input_bytes: number;
  duration_sec?: number | null;
  created_at: number;
  updated_at: number;
}

export interface StatRow {
  model: string;
  arch: string;
  device: string;
  runs: number;
  total_mb: number;
  total_sec: number;
  sec_per_mb: number;
  last_run: number;
}

export interface StatsInfo {
  host_device: string;
  rows: StatRow[];
}

export interface StorageInfo {
  total_bytes: number;
  uploads_bytes: number;
  outputs_bytes: number;
  job_count: number;
}

export interface InputInfo {
  id: string;
  filename: string;
  bytes: number;
  created_at: number;
}
