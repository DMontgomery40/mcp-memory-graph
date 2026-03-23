"""Behavior tests for Memory Graph MCP server."""

import asyncio
import json
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(__file__))

from server import mcp, graph


def _call(name: str, args: dict):
    """Call a tool and return parsed JSON from the result.

    FastMCP returns different shapes depending on the return type:
    - dict return -> list[TextContent]
    - Pydantic model return -> tuple(list[TextContent], structured_dict)
    - list return -> tuple(list[TextContent], {result: [...]})
    """
    result = asyncio.run(mcp.call_tool(name, args))
    if isinstance(result, tuple):
        content_list, structured = result
        # For list returns, prefer the structured side
        if structured is not None and "result" in structured:
            return structured["result"]
        if not content_list:
            return structured if structured is not None else []
        return json.loads(content_list[0].text)
    else:
        content_list = result
        if not content_list:
            return []
        return json.loads(content_list[0].text)


class TestMemoryGraphMCPServer(unittest.TestCase):

    def setUp(self):
        """Reset graph state before each test."""
        for p in graph.get_patterns():
            graph.remove_pattern(p.name)

    # ---- tools/list ----

    def test_list_tools(self):
        tools = asyncio.run(mcp.list_tools())
        names = sorted([t.name for t in tools])
        self.assertEqual(names, ["add_pattern", "get_patterns", "infer_types", "remove_pattern"])

    def test_tools_have_descriptions(self):
        tools = asyncio.run(mcp.list_tools())
        for tool in tools:
            self.assertTrue(tool.description, f"{tool.name} missing description")

    def test_tools_have_input_schema(self):
        tools = asyncio.run(mcp.list_tools())
        for tool in tools:
            self.assertIsNotNone(tool.inputSchema, f"{tool.name} missing inputSchema")
            self.assertEqual(tool.inputSchema.get("type"), "object")

    def test_tools_have_annotations(self):
        tools = asyncio.run(mcp.list_tools())
        for tool in tools:
            self.assertIsNotNone(tool.annotations, f"{tool.name} missing annotations")

    def test_remove_pattern_is_destructive(self):
        tools = asyncio.run(mcp.list_tools())
        remove_tool = next(t for t in tools if t.name == "remove_pattern")
        self.assertTrue(remove_tool.annotations.destructiveHint)

    def test_infer_types_is_read_only(self):
        tools = asyncio.run(mcp.list_tools())
        infer_tool = next(t for t in tools if t.name == "infer_types")
        self.assertTrue(infer_tool.annotations.readOnlyHint)

    # ---- tools/call - success paths ----

    def test_add_pattern_success(self):
        data = _call("add_pattern", {
            "name": "pdf_doc",
            "required_attributes": {"format": "string", "title": "string"},
            "optional_attributes": {"author": "string"},
            "confidence_threshold": 0.7,
        })
        self.assertEqual(data["name"], "pdf_doc")
        self.assertEqual(data["confidence_threshold"], 0.7)

    def test_get_patterns_empty(self):
        data = _call("get_patterns", {})
        # Empty list or dict with empty result
        if isinstance(data, dict):
            self.assertEqual(data.get("result", []), [])
        else:
            self.assertEqual(data, [])

    def test_get_patterns_after_add(self):
        _call("add_pattern", {
            "name": "test",
            "required_attributes": {"x": "string"},
        })
        data = _call("get_patterns", {})
        # Handle both list and dict-with-result shapes
        items = data if isinstance(data, list) else data.get("result", [])
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["name"], "test")

    def test_remove_pattern_existing(self):
        _call("add_pattern", {
            "name": "to_remove",
            "required_attributes": {"a": "string"},
        })
        data = _call("remove_pattern", {"name": "to_remove"})
        self.assertTrue(data["removed"])

    def test_remove_pattern_nonexistent(self):
        data = _call("remove_pattern", {"name": "nonexistent"})
        self.assertFalse(data["removed"])

    def test_infer_types_match(self):
        _call("add_pattern", {
            "name": "pdf_doc",
            "required_attributes": {"format": "string", "title": "string"},
            "optional_attributes": {"author": "string"},
            "confidence_threshold": 0.7,
        })
        data = _call("infer_types", {
            "document_id": "doc1",
            "attributes": {"format": "pdf", "title": "Report", "author": "Jane"},
        })
        self.assertEqual(data["document_id"], "doc1")
        self.assertTrue(len(data["matches"]) > 0)
        self.assertEqual(data["matches"][0]["pattern_name"], "pdf_doc")
        self.assertGreaterEqual(data["matches"][0]["confidence"], 0.7)

    def test_infer_types_no_match(self):
        _call("add_pattern", {
            "name": "pdf_doc",
            "required_attributes": {"format": "string", "title": "string"},
            "confidence_threshold": 0.7,
        })
        data = _call("infer_types", {
            "document_id": "doc2",
            "attributes": {"color": "blue"},
        })
        self.assertEqual(len(data["matches"]), 0)

    def test_infer_types_below_threshold(self):
        _call("add_pattern", {
            "name": "strict",
            "required_attributes": {"a": "string", "b": "string"},
            "optional_attributes": {"c": "string", "d": "string"},
            "confidence_threshold": 0.9,
        })
        data = _call("infer_types", {
            "document_id": "doc3",
            "attributes": {"a": "x", "b": "y"},
        })
        self.assertEqual(len(data["matches"]), 0)

    def test_add_pattern_idempotent(self):
        """Adding the same pattern twice replaces it."""
        _call("add_pattern", {
            "name": "test",
            "required_attributes": {"x": "string"},
            "confidence_threshold": 0.5,
        })
        _call("add_pattern", {
            "name": "test",
            "required_attributes": {"y": "number"},
            "confidence_threshold": 0.8,
        })
        data = _call("get_patterns", {})
        items = data if isinstance(data, list) else data.get("result", [])
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["confidence_threshold"], 0.8)
        self.assertIn("y", items[0]["required_attributes"])


if __name__ == "__main__":
    unittest.main()
