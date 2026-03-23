# MCP Memory Graph

A Model Context Protocol (MCP) server for pattern-matching document type inference. Available in both Python and TypeScript.

## Overview

Memory Graph provides a semantic layer for classifying documents by matching their attributes against stored patterns. Each pattern defines required and optional attributes with expected types, plus a confidence threshold. Documents are scored against all patterns and matching results are returned sorted by confidence.

## Features

- Pattern-based type inference with confidence scoring
- Required + optional attribute schemas with type validation
- SQLite-backed persistent storage (or in-memory)
- Add, list, remove patterns; infer document types
- Dual transport: stdio (default) and streamable-http
- Available in Python (FastMCP) and TypeScript (McpServer)
- Tool annotations (readOnlyHint, destructiveHint, etc.)

## Tools

| Tool | Description | Annotations |
|------|-------------|-------------|
| `add_pattern` | Add or update a document pattern | idempotent, not destructive |
| `get_patterns` | List all stored patterns | read-only, idempotent |
| `remove_pattern` | Remove a pattern by name | destructive, idempotent |
| `infer_types` | Match document attributes against patterns | read-only, idempotent |

## Python Implementation

```bash
cd python
pip install -r requirements.txt
python server.py                                    # stdio
MCP_TRANSPORT=http python server.py                 # streamable-http
python -m pytest test_server.py -v                  # tests
```

## TypeScript Implementation

```bash
cd typescript
npm install && npm run build
npm start                                           # stdio
npm run start:http                                  # streamable-http
npm test                                            # tests
```

## Docker

### Python
```bash
cd python && docker build -t mcp-memory-graph-py .
docker run -p 3000:3000 -v data:/app/data mcp-memory-graph-py
```

### TypeScript
```bash
cd typescript && docker build -t mcp-memory-graph-ts .
docker run -p 3000:3000 -v data:/app/data mcp-memory-graph-ts
```

## Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "memory-graph": {
      "command": "python",
      "args": ["/absolute/path/to/mcp-memory-graph/python/server.py"]
    }
  }
}
```

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `MCP_TRANSPORT` | `stdio` | Transport: `stdio` or `http` |
| `MCP_HTTP_HOST` | `127.0.0.1` | HTTP bind host |
| `MCP_HTTP_PORT` | `3000` | HTTP bind port |
| `MEMORY_GRAPH_DB` | `:memory:` | SQLite database path (`:memory:` for in-memory) |

## License

MIT

---

## Appendix: MCP in Practice (Code Execution, Tool Scale, and Safety)

Last updated: 2026-03-23

### Why This Appendix Exists
Model Context Protocol (MCP) is still one of the most useful interoperability layers for tools and agents. The tradeoff is that large MCP servers can expose many tools, and naive tool-calling can flood context windows with schemas, tool chatter, and irrelevant call traces.

In practice, "more tools" is not always "better outcomes." Tool surface area must be paired with execution patterns that keep token use bounded and behavior predictable.

### The Shift to Code Execution / Code Mode
Recent workflows increasingly move complex orchestration out of chat context and into code execution loops. This reduces repetitive schema tokens and makes tool usage auditable and testable.

Core reading:
- [Cloudflare: Code Mode](https://blog.cloudflare.com/code-mode/)
- [Cloudflare: Code Execution with MCP](https://blog.cloudflare.com/code-execution-with-mcp/)
- [Anthropic: Code Execution with MCP](https://www.anthropic.com/engineering/code-execution-with-mcp)

### Client Fit Guide (Short Version)
- Claude Code / Codex / Cursor: strong for direct MCP workflows, but still benefit from narrow tool surfaces.
- Code execution wrappers (TypeScript/Python CLIs): better when tool count is high or task chains are multi-step.
- Hosted chat clients with weaker MCP controls: often safer via pre-wrapped CLIs or gateway tools.

### Prompt Injection: Risks, Impact, and Mitigations
Prompt injection remains an open security problem for tool-using agents. It is manageable, but not "solved."

Primary risks:
- Malicious instructions hidden in tool output or remote content.
- Secret exfiltration and unauthorized external calls.
- Unsafe state changes (destructive file/system/API actions).

Mitigation baseline:
- Least privilege for credentials and tool scopes.
- Allowlist destinations and enforce egress controls.
- Strict input validation and schema enforcement.
- Human confirmation for destructive/high-risk actions.
- Sandboxed execution with resource/time limits.
- Structured logging, audit trails, and replayable runs.
- Output filtering/redaction before model re-ingestion.

Treat every tool output as untrusted input unless explicitly verified.
