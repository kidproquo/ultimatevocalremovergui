import type { Arch, JobInfo, ModelInfo } from "./types";

// Derive the API base from the document's base URL so the app works both at a
// domain root (https://host/ -> https://host/api/) and under a sub-path
// (https://host/uvr/ -> https://host/uvr/api/). Requires the page to be served
// with a trailing slash (Caddy adds it via a redir).
const API_BASE = new URL("api/", document.baseURI).toString();

/** Absolute URL for an API path (e.g. "jobs/abc/files/x.wav"). */
export const apiUrl = (path: string) => API_BASE + path.replace(/^\//, "");

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(detail || `${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  listModels: () => fetch(apiUrl("models")).then(json<ModelInfo[]>),

  downloadModel: (arch: Arch, name: string) =>
    fetch(apiUrl("models/download"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ arch, name }),
    }).then(json<JobInfo>),

  separate: (form: FormData) =>
    fetch(apiUrl("separate"), { method: "POST", body: form }).then(json<JobInfo>),

  listJobs: () => fetch(apiUrl("jobs")).then(json<JobInfo[]>),

  getJob: (id: string) => fetch(apiUrl(`jobs/${id}`)).then(json<JobInfo>),
};
