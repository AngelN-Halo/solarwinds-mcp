import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { loadConfig } from "./config.js";
import { SwisClient } from "./swis-client.js";
import { registerTools } from "./tools.js";

function createServer(): McpServer {
  const config = loadConfig();
  const client = new SwisClient(config);
  const server = new McpServer(
    { name: "solarwinds-readonly", version: "0.1.0" },
    {
      instructions:
        "Read-only SolarWinds NPM/NCM access. Search for a node before requesting node-specific health. Never infer that these tools can modify SolarWinds or network devices."
    }
  );
  registerTools(server, client, config);
  return server;
}

void serveStdio(createServer);
console.error("SolarWinds read-only MCP server running on stdio");
