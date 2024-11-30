import { MemoryGraphMCP } from '../src/memory-graph';
import { Document, Pattern } from '../src/types';

describe('MemoryGraphMCP', () => {
  let memoryGraph: MemoryGraphMCP;

  beforeEach(() => {
    memoryGraph = new MemoryGraphMCP(':memory:');
    const testPattern: Pattern = {
      name: 'test_doc',
      required_attributes: {
        title: 'string',
        format: 'string'
      },
      optional_attributes: {
        author: 'string'
      },
      confidence_threshold: 0.7
    };
    memoryGraph.addPattern(testPattern);
  });

  test('infer types for matching document', async () => {
    const doc: Document = {
      id: 'doc1',
      attributes: {
        title: 'Test Document',
        format: 'pdf',
        author: 'John Doe'
      }
    };

    const result = memoryGraph.inferTypes(doc);
    expect(result.pattern_name).toBe('test_doc');
    expect(result.confidence).toBeGreaterThanOrEqual(0.7);
  });

  test('get patterns returns added patterns', async () => {
    const patterns = memoryGraph.getPatterns();
    expect(patterns).toHaveLength(1);
    expect(patterns[0].name).toBe('test_doc');
  });

  test('handle MCP request for infer command', async () => {
    const request = {
      command: 'infer',
      parameters: {
        id: 'doc1',
        attributes: {
          title: 'Test Document',
          format: 'pdf'
        }
      }
    };

    const response = await memoryGraph.handleRequest(request);
    expect(response.status).toBe('success');
    expect(response.data?.pattern_name).toBe('test_doc');
  });
});