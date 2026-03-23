#!/usr/bin/env node

/**
 * MCP Memory Graph Server — pattern-matching document type inference via MCP.
 *
 * Supports both stdio and streamable-http transports.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { MemoryGraph } from "./memory-graph.js";

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

const DB_PATH = process.env.MEMORY_GRAPH_DB ?? ":memory:";
const graph = new MemoryGraph(DB_PATH);

const server = new McpServer(
  { name: "memory-graph", version: "2.0.0" },
  { capabilities: { tools: {} } },
);

// ---------------------------------------------------------------------------
// Tool: add_pattern
// ---------------------------------------------------------------------------

server.registerTool(
  "add_pattern",
  {
    title: "Add Pattern",
    description:
      "Add or update a document pattern in the memory graph. " +
      "Patterns define required and optional attribute schemas with expected types " +
      "(string, number, int, float, boolean, list, dict). " +
      "If a pattern with the same name exists, it is replaced. " +
      "Side effects: writes to SQLite database.",
    inputSchema: z.object({
      name: z.string().describe("Unique pattern name (e.g. 'pdf_document')"),
      required_attributes: z
        .record(z.string(), z.string())
        .describe("Map of attribute name to expected type"),
      optional_attributes: z
        .record(z.string(), z.string())
        .default({})
        .describe("Map of optional attribute name to expected type"),
      confidence_threshold: z
        .number()
        .min(0)
        .max(1)
        .default(0.7)
        .describe("Minimum confidence (0.0-1.0) for a match to qualify"),
    }),
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async ({ name, required_attributes, optional_attributes, confidence_threshold }) => {
    graph.addPattern({
      name,
      required_attributes,
      optional_attributes: optional_attributes ?? {},
      confidence_threshold: confidence_threshold ?? 0.7,
    });
    const pattern = graph.getPattern(name)!;
    return {
      content: [{ type: "text", text: JSON.stringify(pattern, null, 2) }],
    };
  },
);

// ---------------------------------------------------------------------------
// Tool: get_patterns
// ---------------------------------------------------------------------------

server.registerTool(
  "get_patterns",
  {
    title: "List Patterns",
    description:
      "List all stored patterns in the memory graph. " +
      "No inputs required. Returns an array of pattern definitions. " +
      "No side effects.",
    inputSchema: z.object({}),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async () => ({
    content: [{ type: "text", text: JSON.stringify(graph.getPatterns(), null, 2) }],
  }),
);

// ---------------------------------------------------------------------------
// Tool: remove_pattern
// ---------------------------------------------------------------------------

server.registerTool(
  "remove_pattern",
  {
    title: "Remove Pattern",
    description:
      "Remove a pattern from the memory graph. " +
      "DESTRUCTIVE: permanently removes the pattern from the database. " +
      "Returns whether the pattern existed.",
    inputSchema: z.object({
      name: z.string().describe("Name of the pattern to remove"),
    }),
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async ({ name }) => {
    const removed = graph.removePattern(name);
    return {
      content: [{ type: "text", text: JSON.stringify({ removed, name }) }],
    };
  },
);

// ---------------------------------------------------------------------------
// Tool: infer_types
// ---------------------------------------------------------------------------

server.registerTool(
  "infer_types",
  {
    title: "Infer Document Types",
    description:
      "Infer document type by matching attributes against stored patterns. " +
      "Returns all matching patterns sorted by confidence (highest first), " +
      "filtered by each pattern's confidence threshold. " +
      "No side effects.",
    inputSchema: z.object({
      document_id: z.string().describe("Unique document identifier"),
      attributes: z
        .record(z.string(), z.unknown())
        .describe("Map of attribute name to value for the document to classify"),
    }),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async ({ document_id, attributes }) => {
    const results = graph.inferTypes({ id: document_id, attributes });
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              document_id,
              matches: results,
            },
            null,
            2,
          ),
        },
      ],
    };
  },
);

// ---------------------------------------------------------------------------
// Graceful Shutdown
// ---------------------------------------------------------------------------

process.on("SIGINT", () => {
  graph.close();
  process.exit(0);
});
process.on("SIGTERM", () => {
  graph.close();
  process.exit(0);
});

// ---------------------------------------------------------------------------
// Transport Startup
// ---------------------------------------------------------------------------

async function main() {
  const transportMode = process.env.MCP_TRANSPORT ?? "stdio";

  if (transportMode === "http") {
    const express = (await import("express")).default;
    const app = express();
    app.use(express.json());

    const httpPort = parseInt(process.env.MCP_HTTP_PORT ?? "3000", 10);
    const httpHost = process.env.MCP_HTTP_HOST ?? "127.0.0.1";

    app.post("/mcp", async (req, res) => {
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    });

    app.get("/mcp", async (_req, res) => {
      res.writeHead(405).end(JSON.stringify({ error: "Method Not Allowed. Use POST." }));
    });

    app.delete("/mcp", async (_req, res) => {
      res.writeHead(405).end(JSON.stringify({ error: "Method Not Allowed." }));
    });

    app.get("/health", (_req, res) => {
      res.json({ status: "ok", server: "memory-graph", version: "2.0.0" });
    });

    app.listen(httpPort, httpHost, () => {
      console.error(`Memory Graph MCP Server listening on http://${httpHost}:${httpPort}/mcp`);
    });
  } else {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Memory Graph MCP Server running on stdio");
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  graph.close();
  process.exit(1);
});
