#!/usr/bin/env python3
"""MCP Memory Graph Server — pattern-matching type inference via MCP.

Provides tools to add, list, remove patterns and infer document types
against stored patterns using a SQLite-backed pattern store.

Supports both stdio and streamable-http transports.
"""

import json
import os
from typing import Optional

from pydantic import BaseModel, Field

from mcp.server.fastmcp import FastMCP

from src.memory_graph import MemoryGraph, Pattern, Document

# ---------------------------------------------------------------------------
# Server + Graph setup
# ---------------------------------------------------------------------------

DB_PATH = os.environ.get("MEMORY_GRAPH_DB", ":memory:")

graph = MemoryGraph(DB_PATH)

mcp = FastMCP(
    "memory-graph",
    stateless_http=True,
    json_response=True,
)


# ---------------------------------------------------------------------------
# Structured output models
# ---------------------------------------------------------------------------


class PatternResult(BaseModel):
    name: str
    required_attributes: dict = Field(description="Required attribute name -> type mappings")
    optional_attributes: dict = Field(description="Optional attribute name -> type mappings")
    confidence_threshold: float


class InferenceMatch(BaseModel):
    pattern_name: str
    confidence: float = Field(description="Match confidence between 0.0 and 1.0")
    matched_attributes: list[str]


class InferenceOutput(BaseModel):
    document_id: str
    matches: list[InferenceMatch]


# ---------------------------------------------------------------------------
# Tools
# ---------------------------------------------------------------------------


@mcp.tool(
    annotations={
        "readOnlyHint": False,
        "destructiveHint": False,
        "idempotentHint": True,
        "openWorldHint": False,
    }
)
def add_pattern(
    name: str = Field(description="Unique pattern name (e.g. 'pdf_document')"),
    required_attributes: dict = Field(
        description="Map of attribute name to expected type (string, number, int, float, boolean, list, dict)"
    ),
    optional_attributes: dict = Field(
        default_factory=dict,
        description="Map of optional attribute name to expected type. Defaults to empty.",
    ),
    confidence_threshold: float = Field(
        default=0.7,
        description="Minimum confidence (0.0-1.0) for a match to qualify. Defaults to 0.7.",
    ),
) -> PatternResult:
    """Add or update a document pattern in the memory graph.

    Use this when a user wants to define a new document type or update an existing one.
    Patterns define required and optional attributes with expected types, plus a confidence
    threshold for matching. If a pattern with the same name exists, it is replaced.
    Side effects: writes to SQLite database.
    """
    pattern = Pattern(
        name=name,
        required_attributes=required_attributes,
        optional_attributes=optional_attributes,
        confidence_threshold=confidence_threshold,
    )
    graph.add_pattern(pattern)
    return PatternResult(
        name=pattern.name,
        required_attributes=pattern.required_attributes,
        optional_attributes=pattern.optional_attributes,
        confidence_threshold=pattern.confidence_threshold,
    )


@mcp.tool(
    annotations={
        "readOnlyHint": True,
        "destructiveHint": False,
        "idempotentHint": True,
        "openWorldHint": False,
    }
)
def get_patterns() -> list[PatternResult]:
    """List all stored patterns in the memory graph.

    Use this when a user asks what patterns/document types are defined.
    No inputs required. Returns an array of pattern definitions.
    No side effects.
    """
    patterns = graph.get_patterns()
    return [
        PatternResult(
            name=p.name,
            required_attributes=p.required_attributes,
            optional_attributes=p.optional_attributes,
            confidence_threshold=p.confidence_threshold,
        )
        for p in patterns
    ]


@mcp.tool(
    annotations={
        "readOnlyHint": False,
        "destructiveHint": True,
        "idempotentHint": True,
        "openWorldHint": False,
    }
)
def remove_pattern(
    name: str = Field(description="Name of the pattern to remove"),
) -> dict:
    """Remove a pattern from the memory graph.

    Use this when a user wants to delete a document type definition.
    DESTRUCTIVE: permanently removes the pattern from the database.
    Returns whether the pattern existed.
    """
    removed = graph.remove_pattern(name)
    return {"removed": removed, "name": name}


@mcp.tool(
    annotations={
        "readOnlyHint": True,
        "destructiveHint": False,
        "idempotentHint": True,
        "openWorldHint": False,
    }
)
def infer_types(
    document_id: str = Field(description="Unique identifier for the document"),
    attributes: dict = Field(
        description="Map of attribute name to value for the document to classify"
    ),
) -> InferenceOutput:
    """Infer document type by matching attributes against stored patterns.

    Use this when a user wants to classify a document or determine what type it matches.
    Requires a document_id and an attributes dict. Returns all matching patterns sorted
    by confidence (highest first), filtered by each pattern's confidence threshold.
    No side effects.
    """
    doc = Document(id=document_id, attributes=attributes)
    results = graph.infer_types(doc)
    return InferenceOutput(
        document_id=document_id,
        matches=[
            InferenceMatch(
                pattern_name=r.pattern_name,
                confidence=r.confidence,
                matched_attributes=r.matched_attributes,
            )
            for r in results
        ],
    )


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    transport = os.environ.get("MCP_TRANSPORT", "stdio")
    if transport in ("http", "streamable-http"):
        host = os.environ.get("MCP_HTTP_HOST", "127.0.0.1")
        port = int(os.environ.get("MCP_HTTP_PORT", "3000"))
        mcp.run(transport="streamable-http", host=host, port=port)
    else:
        mcp.run(transport="stdio")
