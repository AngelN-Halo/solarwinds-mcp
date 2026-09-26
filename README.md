# Read-only SolarWinds MCP example

An allowlisted MCP client for the SolarWinds SWIS API. The included Compose file is a **local example**, not a production network design.

## Configuration

Copy `.env.example` to ignored `.env` and set your own HTTPS SWIS endpoint, read-only account, and credentials. Put your trusted CA in the ignored `secrets/` directory or a secure runtime secret mount. Normal CA-chain and hostname validation are required; if you configure a SHA-256 leaf-certificate pin, it must also match. Pinning never overrides a CA or hostname failure. Plan for certificate rotation before enabling a pin. Never commit credentials, certificates, fingerprints from production, host names, API responses, or network diagrams.

## Deployment boundary

The stdio service has no published port. The optional OpenAPI bridge remains reachable only on the project-local Compose network; this example does not configure a reverse proxy or public URL. Supply an authenticated, authorized gateway and network policy privately if clients need remote access. Do not expose the bridge directly to the internet.

After creating a local `.env`, run `docker compose config`, build, and test against an approved non-production endpoint. Check least-privilege queries, TLS, output minimization, audit logging, and rate limits before use with real infrastructure.

Run offline certificate-pin regression tests with `corepack pnpm install --frozen-lockfile && corepack pnpm test`. These tests do not contact SolarWinds or replace TLS integration testing against an approved endpoint.
