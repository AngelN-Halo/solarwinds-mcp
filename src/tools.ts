import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import type { SolarWindsConfig } from "./config.js";
import type { SwisClient, SwisParameters, SwisRow } from "./swis-client.js";

function result(rows: SwisRow[]) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify({ count: rows.length, results: rows }, null, 2) }],
    structuredContent: { count: rows.length, results: rows }
  };
}

function failure(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown SolarWinds error";
  return {
    isError: true,
    content: [{ type: "text" as const, text: message }]
  };
}

export function registerTools(
  server: McpServer,
  client: SwisClient,
  config: SolarWindsConfig
): void {
  const boundedLimit = (requested: number): number => Math.min(requested, config.maxResults);

  server.registerTool(
    "solarwinds_connection_test",
    {
      title: "Test SolarWinds connection",
      description: "Checks read-only SWIS authentication and returns one monitored node.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true }
    },
    async () => {
      try {
        return result(await client.query("SELECT TOP 1 NodeID, Caption, StatusDescription FROM Orion.Nodes"));
      } catch (error) {
        return failure(error);
      }
    }
  );

  server.registerTool(
    "solarwinds_search_nodes",
    {
      title: "Search SolarWinds nodes",
      description: "Searches monitored nodes by caption, DNS name, or IP address.",
      inputSchema: z.object({
        query: z.string().trim().min(1).max(200),
        limit: z.number().int().min(1).max(100).default(25)
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true }
    },
    async ({ query, limit }) => {
      try {
        const top = boundedLimit(limit);
        const rows = await client.query(
          `SELECT TOP ${top}
             NodeID, Caption, IPAddress, DNS, Vendor, MachineType, Location,
             Status, StatusDescription, UnManaged, ResponseTime, PercentLoss,
             CPULoad, PercentMemoryUsed, LastBoot
           FROM Orion.Nodes
           WHERE Caption LIKE @needle OR DNS LIKE @needle OR IPAddress LIKE @needle
           ORDER BY Caption`,
          { needle: `%${query}%` }
        );
        return result(rows);
      } catch (error) {
        return failure(error);
      }
    }
  );

  server.registerTool(
    "solarwinds_get_node_health",
    {
      title: "Get SolarWinds node health",
      description: "Returns current read-only health and polling data for one SolarWinds node ID.",
      inputSchema: z.object({ nodeId: z.number().int().positive() }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true }
    },
    async ({ nodeId }) => {
      try {
        return result(
          await client.query(
            `SELECT NodeID, Caption, IPAddress, DNS, Vendor, MachineType, Location,
                    Status, StatusDescription, UnManaged, ResponseTime, PercentLoss,
                    CPULoad, PercentMemoryUsed, LastBoot, LastSync, NextPoll,
                    NextRediscovery, PollInterval, RediscoveryInterval
             FROM Orion.Nodes
             WHERE NodeID = @nodeId`,
            { nodeId }
          )
        );
      } catch (error) {
        return failure(error);
      }
    }
  );

  server.registerTool(
    "solarwinds_list_active_alerts",
    {
      title: "List active SolarWinds alerts",
      description: "Lists current alerts, optionally restricted to one SolarWinds node ID.",
      inputSchema: z.object({
        nodeId: z.number().int().positive().optional(),
        limit: z.number().int().min(1).max(100).default(25)
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true }
    },
    async ({ nodeId, limit }) => {
      try {
        const top = boundedLimit(limit);
        const where = nodeId === undefined ? "" : "WHERE NodeID = @nodeId";
        const parameters: SwisParameters = nodeId === undefined ? {} : { nodeId };
        return result(
          await client.query(
            `SELECT TOP ${top}
                    AlertID, AlertTime, ObjectType, ObjectID, ObjectName,
                    NodeID, NodeName, EventMessage, Monitoredproperty,
                    CurrentValue, TriggerValue, AlertNotes
             FROM Orion.ActiveAlerts
             ${where}
             ORDER BY AlertTime DESC`,
            parameters
          )
        );
      } catch (error) {
        return failure(error);
      }
    }
  );

  server.registerTool(
    "solarwinds_find_interface_issues",
    {
      title: "Find SolarWinds interface issues",
      description: "Lists non-up or highly utilized NPM interfaces, optionally for one node.",
      inputSchema: z.object({
        nodeId: z.number().int().positive().optional(),
        utilizationAtLeast: z.number().min(0).max(100).default(80),
        limit: z.number().int().min(1).max(100).default(25)
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true }
    },
    async ({ nodeId, utilizationAtLeast, limit }) => {
      try {
        const top = boundedLimit(limit);
        const nodeClause = nodeId === undefined ? "" : "AND I.NodeID = @nodeId";
        const parameters: SwisParameters = nodeId === undefined
          ? { utilization: utilizationAtLeast }
          : { utilization: utilizationAtLeast, nodeId };
        return result(
          await client.query(
            `SELECT TOP ${top}
                    I.NodeID, I.InterfaceID, I.Node.Caption AS NodeCaption,
                    I.Caption AS InterfaceCaption, I.Status, I.StatusDescription,
                    I.AdminStatus, I.OperStatus, I.InPercentUtil, I.OutPercentUtil,
                    I.Inbps, I.Outbps, I.Speed, I.LastChange
             FROM Orion.NPM.Interfaces I
             WHERE (I.Status <> 1 OR I.InPercentUtil >= @utilization OR I.OutPercentUtil >= @utilization)
             ${nodeClause}
             ORDER BY I.Status DESC, I.InPercentUtil DESC, I.OutPercentUtil DESC`,
            parameters
          )
        );
      } catch (error) {
        return failure(error);
      }
    }
  );

  server.registerTool(
    "solarwinds_get_ncm_inventory",
    {
      title: "Get SolarWinds NCM inventory",
      description: "Returns non-secret NCM device inventory. Credential fields and config bodies are never queried.",
      inputSchema: z.object({
        nodeId: z.number().int().positive().optional(),
        query: z.string().trim().min(1).max(200).optional(),
        limit: z.number().int().min(1).max(100).default(25)
      }).refine((value) => value.nodeId !== undefined || value.query !== undefined, {
        message: "Provide nodeId or query"
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true }
    },
    async ({ nodeId, query, limit }) => {
      try {
        const top = boundedLimit(limit);
        const where = nodeId !== undefined
          ? "CoreNodeID = @nodeId"
          : "(NodeCaption LIKE @needle OR AgentIP LIKE @needle OR ReverseDNS LIKE @needle)";
        const parameters: SwisParameters = nodeId !== undefined
          ? { nodeId }
          : { needle: `%${query}%` };
        return result(
          await client.query(
            `SELECT TOP ${top}
                    NodeID, CoreNodeID, NodeCaption, AgentIP, ReverseDNS,
                    Status, Vendor, MachineType, OSImage, OSVersion,
                    ConfigTypes, LoginStatus, LastInventory
             FROM NCM.Nodes
             WHERE ${where}
             ORDER BY NodeCaption`,
            parameters
          )
        );
      } catch (error) {
        return failure(error);
      }
    }
  );
}
