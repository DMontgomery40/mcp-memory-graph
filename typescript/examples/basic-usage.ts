import { MemoryGraphMCP } from 'mcp-memory-graph-ts';
import { registerTool } from 'mcp-core';
import { Document, Pattern } from '../src/types';

// Initialize the memory graph
const memoryGraph = new MemoryGraphMCP();

// Register with Claude Desktop
registerTool('memory_graph', memoryGraph);

// Add a pattern
const pdfPattern: Pattern = {
  name: 'pdf_document',
  required_attributes: {
    format: 'string',
    title: 'string'
  },
  optional_attributes: {
    author: 'string',
    pages: 'number'
  },
  confidence_threshold: 0.7
};

memoryGraph.addPattern(pdfPattern);

// Create a document
const doc: Document = {
  id: 'doc1',
  attributes: {
    title: 'Project Report',
    format: 'pdf',
    author: 'John Doe',
    pages: 42
  }
};

// Infer document type
const result = memoryGraph.inferTypes(doc);
console.log('Inferred pattern:', result.pattern_name);
console.log('Confidence:', result.confidence);
console.log('Matched attributes:', result.matched_attributes);