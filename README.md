# MCP Memory Graph

A Model Context Protocol (MCP) implementation of the Memory Graph system for Claude Desktop, available in both Python and TypeScript.

## Overview

This project provides a semantic layer that enhances Claude Desktop's memory capabilities with pattern matching and type inference. It allows Claude to understand and categorize different types of documents and data structures based on their attributes.

## Features

- Real-time type inference with confidence scoring
- Pattern matching with attribute validation
- SQLite-based pattern storage
- Available in both Python and TypeScript
- Full MCP integration for Claude Desktop

## Quick Start

### Python Implementation

```bash
pip install mcp-memory-graph
```

```python
from mcp_memory_graph import MemoryGraphMCP
from mcp_core import register_tool

# Initialize the tool
memory_graph = MemoryGraphMCP()

# Register with Claude Desktop
register_tool('memory_graph', memory_graph)
```

### TypeScript Implementation

```bash
npm install mcp-memory-graph-ts
```

```typescript
import { MemoryGraphMCP } from 'mcp-memory-graph-ts';
import { registerTool } from 'mcp-core';

// Initialize the tool
const memoryGraph = new MemoryGraphMCP();

// Register with Claude Desktop
registerTool('memory_graph', memoryGraph);
```

## Usage in Claude Desktop

Once registered, you can use the memory_graph tool with the following commands:

1. Add a pattern:
```json
{
  "command": "add_pattern",
  "parameters": {
    "name": "pdf_document",
    "required_attributes": {
      "format": "string",
      "title": "string"
    },
    "optional_attributes": {
      "author": "string",
      "pages": "number"
    },
    "confidence_threshold": 0.7
  }
}
```

2. Infer types:
```json
{
  "command": "infer",
  "parameters": {
    "id": "doc1",
    "attributes": {
      "title": "Project Report",
      "format": "pdf",
      "author": "John Doe"
    }
  }
}
```

3. Get patterns:
```json
{
  "command": "get_patterns",
  "parameters": {}
}
```

## Documentation

- [Python Implementation](python/README.md)
- [TypeScript Implementation](typescript/README.md)

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT
