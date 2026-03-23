FROM node:20-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY build/ ./build/

ENV MCP_TRANSPORT=http
ENV MCP_HTTP_PORT=3000
ENV MCP_HTTP_HOST=0.0.0.0
ENV MEMORY_GRAPH_DB=/app/data/memory-graph.db

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

LABEL org.opencontainers.image.title="mcp-memory-graph-typescript" \
      org.opencontainers.image.description="MCP server for pattern-matching document type inference (TypeScript)" \
      org.opencontainers.image.version="2.0.0"

ENTRYPOINT ["node", "build/src/index.js"]
