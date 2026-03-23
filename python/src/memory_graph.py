"""Core Memory Graph engine — pattern storage, matching, and type inference."""

import json
import os
import sqlite3
from dataclasses import dataclass, field
from typing import Any


@dataclass
class Pattern:
    """A named pattern with required/optional attribute schemas."""

    name: str
    required_attributes: dict[str, str]  # attr_name -> type_name
    optional_attributes: dict[str, str] = field(default_factory=dict)
    confidence_threshold: float = 0.7


@dataclass
class Document:
    """A document to classify against patterns."""

    id: str
    attributes: dict[str, Any]


@dataclass
class InferenceResult:
    """Result of pattern inference for a document."""

    pattern_name: str
    confidence: float
    matched_attributes: list[str]


class MemoryGraph:
    """SQLite-backed pattern store with type inference."""

    def __init__(self, db_path: str = ":memory:"):
        self._conn = sqlite3.connect(db_path)
        self._conn.row_factory = sqlite3.Row
        self._init_schema()

    def _init_schema(self) -> None:
        self._conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS patterns (
                name TEXT PRIMARY KEY,
                required_attributes TEXT NOT NULL,
                optional_attributes TEXT NOT NULL DEFAULT '{}',
                confidence_threshold REAL NOT NULL DEFAULT 0.7
            );
            """
        )
        self._conn.commit()

    # ---- Pattern management ----

    def add_pattern(self, pattern: Pattern) -> None:
        """Add or replace a pattern."""
        self._conn.execute(
            """
            INSERT OR REPLACE INTO patterns
                (name, required_attributes, optional_attributes, confidence_threshold)
            VALUES (?, ?, ?, ?)
            """,
            (
                pattern.name,
                json.dumps(pattern.required_attributes),
                json.dumps(pattern.optional_attributes),
                pattern.confidence_threshold,
            ),
        )
        self._conn.commit()

    def remove_pattern(self, name: str) -> bool:
        """Remove a pattern. Returns True if it existed."""
        cursor = self._conn.execute("DELETE FROM patterns WHERE name = ?", (name,))
        self._conn.commit()
        return cursor.rowcount > 0

    def get_patterns(self) -> list[Pattern]:
        """Return all stored patterns."""
        rows = self._conn.execute("SELECT * FROM patterns").fetchall()
        return [
            Pattern(
                name=r["name"],
                required_attributes=json.loads(r["required_attributes"]),
                optional_attributes=json.loads(r["optional_attributes"]),
                confidence_threshold=r["confidence_threshold"],
            )
            for r in rows
        ]

    def get_pattern(self, name: str) -> Pattern | None:
        """Return a single pattern by name, or None."""
        row = self._conn.execute(
            "SELECT * FROM patterns WHERE name = ?", (name,)
        ).fetchone()
        if row is None:
            return None
        return Pattern(
            name=row["name"],
            required_attributes=json.loads(row["required_attributes"]),
            optional_attributes=json.loads(row["optional_attributes"]),
            confidence_threshold=row["confidence_threshold"],
        )

    # ---- Inference ----

    def infer_types(self, doc: Document) -> list[InferenceResult]:
        """Match a document against all patterns and return qualifying matches."""
        patterns = self.get_patterns()
        results: list[InferenceResult] = []

        for pattern in patterns:
            matched: list[str] = []
            total_attrs = len(pattern.required_attributes) + len(
                pattern.optional_attributes
            )
            if total_attrs == 0:
                continue

            # Check required attributes
            all_required_present = True
            for attr_name, attr_type in pattern.required_attributes.items():
                if attr_name in doc.attributes:
                    if self._type_matches(doc.attributes[attr_name], attr_type):
                        matched.append(attr_name)
                    else:
                        all_required_present = False
                        break
                else:
                    all_required_present = False
                    break

            if not all_required_present:
                continue

            # Check optional attributes
            for attr_name, attr_type in pattern.optional_attributes.items():
                if attr_name in doc.attributes:
                    if self._type_matches(doc.attributes[attr_name], attr_type):
                        matched.append(attr_name)

            confidence = len(matched) / total_attrs
            if confidence >= pattern.confidence_threshold:
                results.append(
                    InferenceResult(
                        pattern_name=pattern.name,
                        confidence=round(confidence, 4),
                        matched_attributes=matched,
                    )
                )

        results.sort(key=lambda r: r.confidence, reverse=True)
        return results

    @staticmethod
    def _type_matches(value: Any, expected_type: str) -> bool:
        """Check whether a value matches the expected type name."""
        type_map: dict[str, type | tuple[type, ...]] = {
            "string": str,
            "str": str,
            "number": (int, float),
            "int": int,
            "float": (int, float),
            "boolean": bool,
            "bool": bool,
            "list": list,
            "dict": dict,
            "object": dict,
        }
        expected = type_map.get(expected_type.lower())
        if expected is None:
            return True  # unknown type = accept anything
        return isinstance(value, expected)

    def close(self) -> None:
        self._conn.close()
