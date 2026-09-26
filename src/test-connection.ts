import { loadConfig } from "./config.js";
import { SwisClient } from "./swis-client.js";

async function main(): Promise<void> {
  const client = new SwisClient(loadConfig());
  const rows = await client.query(
    "SELECT TOP 1 NodeID, Caption, StatusDescription FROM Orion.Nodes"
  );
  console.log(JSON.stringify({ ok: true, results: rows }, null, 2));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown error";
  console.error(JSON.stringify({ ok: false, error: message }, null, 2));
  process.exitCode = 1;
});
