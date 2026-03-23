import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { MemoryGraph } from "../src/memory-graph.js";

function createTestServer(): { server: McpServer; graph: MemoryGraph } {
  const graph = new MemoryGraph(":memory:");

  const server = new McpServer(
    { name: "memory-graph", version: "2.0.0" },
    { capabilities: { tools: {} } },
  );

  server.registerTool(
    "add_pattern",
    {
      title: "Add Pattern",
      description: "Add or update a document pattern.",
      inputSchema: z.object({
        name: z.string(),
        required_attributes: z.record(z.string(), z.string()),
        optional_attributes: z.record(z.string(), z.string()).default({}),
        confidence_threshold: z.number().min(0).max(1).default(0.7),
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
      return {
        content: [{ type: "text", text: JSON.stringify(graph.getPattern(name)) }],
      };
    },
  );

  server.registerTool(
    "get_patterns",
    {
      title: "List Patterns",
      description: "List all patterns.",
      inputSchema: z.object({}),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => ({
      content: [{ type: "text", text: JSON.stringify(graph.getPatterns()) }],
    }),
  );

  server.registerTool(
    "remove_pattern",
    {
      title: "Remove Pattern",
      description: "Remove a pattern. DESTRUCTIVE.",
      inputSchema: z.object({ name: z.string() }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ name }) => ({
      content: [{ type: "text", text: JSON.stringify({ removed: graph.removePattern(name), name }) }],
    }),
  );

  server.registerTool(
    "infer_types",
    {
      title: "Infer Document Types",
      description: "Match document attributes against patterns.",
      inputSchema: z.object({
        document_id: z.string(),
        attributes: z.record(z.string(), z.unknown()),
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
        content: [{ type: "text", text: JSON.stringify({ document_id, matches: results }) }],
      };
    },
  );

  return { server, graph };
}

describe("memory-graph MCP server", () => {
  let client: Client;
  let server: McpServer;
  let graph: MemoryGraph;

  before(async () => {
    const s = createTestServer();
    server = s.server;
    graph = s.graph;
    client = new Client({ name: "test-client", version: "1.0.0" });

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  });

  after(async () => {
    await client.close();
    await server.close();
    graph.close();
  });

  beforeEach(() => {
    // Clear all patterns
    for (const p of graph.getPatterns()) {
      graph.removePattern(p.name);
    }
  });

  // ---- tools/list ----

  describe("tools/list", () => {
    it("exposes all four tools", async () => {
      const result = await client.listTools();
      const names = result.tools.map((t) => t.name).sort();
      assert.deepEqual(names, ["add_pattern", "get_patterns", "infer_types", "remove_pattern"]);
    });

    it("all tools have descriptions and schemas", async () => {
      const result = await client.listTools();
      for (const tool of result.tools) {
        assert.ok(tool.description, `${tool.name} missing description`);
        assert.ok(tool.inputSchema, `${tool.name} missing inputSchema`);
        assert.equal(tool.inputSchema.type, "object");
      }
    });

    it("all tools have annotations", async () => {
      const result = await client.listTools();
      for (const tool of result.tools) {
        assert.ok(tool.annotations, `${tool.name} missing annotations`);
      }
    });

    it("remove_pattern is destructive", async () => {
      const result = await client.listTools();
      const t = result.tools.find((t) => t.name === "remove_pattern")!;
      assert.equal(t.annotations?.destructiveHint, true);
    });

    it("infer_types is read-only", async () => {
      const result = await client.listTools();
      const t = result.tools.find((t) => t.name === "infer_types")!;
      assert.equal(t.annotations?.readOnlyHint, true);
    });
  });

  // ---- success paths ----

  describe("tools/call - success paths", () => {
    it("add_pattern creates a pattern", async () => {
      const result = await client.callTool({
        name: "add_pattern",
        arguments: {
          name: "pdf_doc",
          required_attributes: { format: "string", title: "string" },
          optional_attributes: { author: "string" },
          confidence_threshold: 0.7,
        },
      });
      assert.ok(!result.isError);
      const data = JSON.parse((result.content as any)[0].text);
      assert.equal(data.name, "pdf_doc");
    });

    it("get_patterns returns empty when no patterns", async () => {
      const result = await client.callTool({ name: "get_patterns", arguments: {} });
      assert.ok(!result.isError);
      const data = JSON.parse((result.content as any)[0].text);
      assert.deepEqual(data, []);
    });

    it("get_patterns returns added patterns", async () => {
      await client.callTool({
        name: "add_pattern",
        arguments: { name: "test", required_attributes: { x: "string" } },
      });
      const result = await client.callTool({ name: "get_patterns", arguments: {} });
      const data = JSON.parse((result.content as any)[0].text);
      assert.equal(data.length, 1);
      assert.equal(data[0].name, "test");
    });

    it("remove_pattern removes existing", async () => {
      await client.callTool({
        name: "add_pattern",
        arguments: { name: "to_remove", required_attributes: { a: "string" } },
      });
      const result = await client.callTool({
        name: "remove_pattern",
        arguments: { name: "to_remove" },
      });
      const data = JSON.parse((result.content as any)[0].text);
      assert.equal(data.removed, true);
    });

    it("remove_pattern returns false for nonexistent", async () => {
      const result = await client.callTool({
        name: "remove_pattern",
        arguments: { name: "nonexistent" },
      });
      const data = JSON.parse((result.content as any)[0].text);
      assert.equal(data.removed, false);
    });

    it("infer_types matches a pattern", async () => {
      await client.callTool({
        name: "add_pattern",
        arguments: {
          name: "pdf_doc",
          required_attributes: { format: "string", title: "string" },
          optional_attributes: { author: "string" },
          confidence_threshold: 0.7,
        },
      });
      const result = await client.callTool({
        name: "infer_types",
        arguments: {
          document_id: "doc1",
          attributes: { format: "pdf", title: "Report", author: "Jane" },
        },
      });
      const data = JSON.parse((result.content as any)[0].text);
      assert.equal(data.document_id, "doc1");
      assert.ok(data.matches.length > 0);
      assert.equal(data.matches[0].pattern_name, "pdf_doc");
      assert.ok(data.matches[0].confidence >= 0.7);
    });

    it("infer_types returns no matches when attributes missing", async () => {
      await client.callTool({
        name: "add_pattern",
        arguments: {
          name: "pdf_doc",
          required_attributes: { format: "string", title: "string" },
        },
      });
      const result = await client.callTool({
        name: "infer_types",
        arguments: { document_id: "doc2", attributes: { color: "blue" } },
      });
      const data = JSON.parse((result.content as any)[0].text);
      assert.equal(data.matches.length, 0);
    });

    it("add_pattern is idempotent (replaces)", async () => {
      await client.callTool({
        name: "add_pattern",
        arguments: { name: "t", required_attributes: { x: "string" }, confidence_threshold: 0.5 },
      });
      await client.callTool({
        name: "add_pattern",
        arguments: { name: "t", required_attributes: { y: "number" }, confidence_threshold: 0.8 },
      });
      const result = await client.callTool({ name: "get_patterns", arguments: {} });
      const data = JSON.parse((result.content as any)[0].text);
      assert.equal(data.length, 1);
      assert.equal(data[0].confidence_threshold, 0.8);
    });
  });

  // ---- validation failures ----

  describe("tools/call - validation failures", () => {
    it("add_pattern rejects missing name", async () => {
      const result = await client.callTool({
        name: "add_pattern",
        arguments: { required_attributes: { x: "string" } },
      });
      assert.ok(result.isError);
    });

    it("infer_types rejects missing document_id", async () => {
      const result = await client.callTool({
        name: "infer_types",
        arguments: { attributes: { a: "b" } },
      });
      assert.ok(result.isError);
    });

    it("unknown tool returns error", async () => {
      const result = await client.callTool({
        name: "nonexistent_tool",
        arguments: {},
      });
      assert.ok(result.isError);
    });
  });
});
