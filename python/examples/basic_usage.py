from mcp_memory_graph import MemoryGraphMCP, Document, Pattern
from mcp_core import register_tool

def main():
    # Initialize the memory graph
    memory_graph = MemoryGraphMCP()

    # Register with Claude Desktop
    register_tool('memory_graph', memory_graph)

    # Add a pattern
    pdf_pattern = Pattern(
        name='pdf_document',
        required_attributes={
            'format': 'str',
            'title': 'str'
        },
        optional_attributes={
            'author': 'str',
            'pages': 'int'
        },
        confidence_threshold=0.7
    )
    memory_graph.add_pattern(pdf_pattern)

    # Create a document
    doc = Document(
        id='doc1',
        attributes={
            'title': 'Project Report',
            'format': 'pdf',
            'author': 'John Doe',
            'pages': 42
        }
    )

    # Infer document type
    result = memory_graph.infer_types(doc)
    print(f'Inferred pattern: {result.pattern_name}')
    print(f'Confidence: {result.confidence}')
    print(f'Matched attributes: {result.matched_attributes}')

if __name__ == '__main__':
    main()