import { readFileSync } from "node:fs";

export interface SolarWindsConfig {
  baseUrl: URL;
  username: string;
  password: string;
  timeoutMs: number;
  maxResults: number;
  ca?: Buffer;
  pfx?: Buffer;
  pfxPassphrase?: string;
  pinnedCertSha256?: string;
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function integerEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer from ${min} through ${max}`);
  }
  return value;
}

function optionalFile(pathVariable: string): Buffer | undefined {
  const path = process.env[pathVariable]?.trim();
  return path ? readFileSync(path) : undefined;
}

function optionalSha256Fingerprint(name: string): string | undefined {
  const raw = process.env[name]?.trim();
  if (!raw) return undefined;
  const normalized = raw.replaceAll(":", "").toUpperCase();
  if (!/^[0-9A-F]{64}$/.test(normalized)) {
    throw new Error(`${name} must be a SHA-256 certificate fingerprint`);
  }
  return normalized;
}

export function loadConfig(): SolarWindsConfig {
  const baseUrl = new URL(requireEnv("SOLARWINDS_BASE_URL"));
  if (baseUrl.protocol !== "https:") {
    throw new Error("SOLARWINDS_BASE_URL must use HTTPS");
  }

  baseUrl.pathname = baseUrl.pathname.replace(/\/+$/, "");
  baseUrl.search = "";
  baseUrl.hash = "";

  return {
    baseUrl,
    username: requireEnv("SOLARWINDS_USERNAME"),
    password: requireEnv("SOLARWINDS_PASSWORD"),
    timeoutMs: integerEnv("SOLARWINDS_TIMEOUT_MS", 15_000, 1_000, 60_000),
    maxResults: integerEnv("SOLARWINDS_MAX_RESULTS", 100, 1, 500),
    ca: optionalFile("SOLARWINDS_CA_CERT_PATH"),
    pfx: optionalFile("SOLARWINDS_CLIENT_PFX_PATH"),
    pfxPassphrase: process.env.SOLARWINDS_CLIENT_PFX_PASSPHRASE,
    pinnedCertSha256: optionalSha256Fingerprint("SOLARWINDS_PINNED_CERT_SHA256")
  };
}
