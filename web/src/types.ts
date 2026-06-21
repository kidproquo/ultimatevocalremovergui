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
  created_at: number;
  updated_at: number;
}
