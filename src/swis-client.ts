import { request } from "node:https";
import { checkServerIdentity } from "node:tls";
import type { PeerCertificate } from "node:tls";
import type { SolarWindsConfig } from "./config.js";

export type SwisValue = string | number | boolean | null;
export type SwisParameters = Record<string, SwisValue>;
export type SwisRow = Record<string, unknown>;

interface QueryResponse {
  results?: SwisRow[];
}

export class SwisClient {
  public constructor(private readonly config: SolarWindsConfig) {}

  public async query(swql: string, parameters: SwisParameters = {}): Promise<SwisRow[]> {
    const endpoint = new URL(`${this.config.baseUrl.toString()}/Query`);
    const body = JSON.stringify({ query: swql, parameters });
    const authorization = Buffer.from(
      `${this.config.username}:${this.config.password}`,
      "utf8"
    ).toString("base64");

    const responseBody = await new Promise<string>((resolve, reject) => {
      const req = request(
        endpoint,
        {
          method: "POST",
          headers: {
            Accept: "application/json",
            Authorization: `Basic ${authorization}`,
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(body)
          },
          ca: this.config.ca,
          pfx: this.config.pfx,
          passphrase: this.config.pfxPassphrase,
          rejectUnauthorized: true,
          checkServerIdentity: (hostname, certificate) =>
            checkPinnedServerIdentity(hostname, certificate, this.config.pinnedCertSha256),
          timeout: this.config.timeoutMs
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (chunk: Buffer) => chunks.push(chunk));
          res.on("end", () => {
            const text = Buffer.concat(chunks).toString("utf8");
            const status = res.statusCode ?? 0;
            if (status < 200 || status >= 300) {
              reject(new Error(`SWIS returned HTTP ${status}: ${safeErrorText(text)}`));
              return;
            }
            resolve(text);
          });
        }
      );

      req.on("timeout", () => req.destroy(new Error("SWIS request timed out")));
      req.on("error", reject);
      req.end(body);
    });

    let parsed: QueryResponse;
    try {
      parsed = JSON.parse(responseBody) as QueryResponse;
    } catch {
      throw new Error("SWIS returned a non-JSON response");
    }
    if (!Array.isArray(parsed.results)) {
      throw new Error("SWIS response did not contain a results array");
    }
    return parsed.results;
  }
}

function safeErrorText(text: string): string {
  return text
    .replace(/Authorization:\s*\S+/gi, "Authorization: [redacted]")
    .replace(/"password"\s*:\s*"[^"]*"/gi, '"password":"[redacted]"')
    .slice(0, 1_000);
}

// Node checks the certificate chain when rejectUnauthorized is true. This callback
// adds a required hostname check AND an optional leaf certificate pin; a pin
// must never override a hostname or CA validation error.
export function checkPinnedServerIdentity(
  hostname: string,
  certificate: PeerCertificate,
  pinnedCertSha256?: string
): Error | undefined {
  const hostnameError = checkServerIdentity(hostname, certificate);
  if (hostnameError) return hostnameError;
  if (pinnedCertSha256) {
    const actual = certificate.fingerprint256?.replaceAll(":", "").toUpperCase();
    if (actual !== pinnedCertSha256) {
      return new Error("SWIS TLS certificate fingerprint mismatch");
    }
  }
  return undefined;
}
