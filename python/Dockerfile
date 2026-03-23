FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY src/ ./src/
COPY server.py .

ENV MCP_TRANSPORT=http
ENV MCP_HTTP_PORT=3000
ENV MCP_HTTP_HOST=0.0.0.0
ENV MEMORY_GRAPH_DB=/app/data/memory-graph.db

EXPOSE 3000

LABEL org.opencontainers.image.title="mcp-memory-graph-python" \
      org.opencontainers.image.description="MCP server for pattern-matching document type inference (Python)" \
      org.opencontainers.image.version="2.0.0"

ENTRYPOINT ["python", "server.py"]
