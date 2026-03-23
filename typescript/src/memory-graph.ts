/**
 * Core Memory Graph engine — pattern storage, matching, and type inference.
 * Uses better-sqlite3 for persistence.
 */

import Database from "better-sqlite3";

export interface Pattern {
  name: string;
  required_attributes: Record<string, string>;
  optional_attributes: Record<string, string>;
  confidence_threshold: number;
}

export interface Document {
  id: string;
  attributes: Record<string, unknown>;
}

export interface InferenceResult {
  pattern_name: string;
  confidence: number;
  matched_attributes: string[];
}

export class MemoryGraph {
  private db: Database.Database;

  constructor(dbPath: string = ":memory:") {
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS patterns (
        name TEXT PRIMARY KEY,
        required_attributes TEXT NOT NULL,
        optional_attributes TEXT NOT NULL DEFAULT '{}',
        confidence_threshold REAL NOT NULL DEFAULT 0.7
      )
    `);
  }

  addPattern(pattern: Pattern): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO patterns
         (name, required_attributes, optional_attributes, confidence_threshold)
         VALUES (?, ?, ?, ?)`,
      )
      .run(
        pattern.name,
        JSON.stringify(pattern.required_attributes),
        JSON.stringify(pattern.optional_attributes),
        pattern.confidence_threshold,
      );
  }

  removePattern(name: string): boolean {
    const result = this.db.prepare("DELETE FROM patterns WHERE name = ?").run(name);
    return result.changes > 0;
  }

  getPatterns(): Pattern[] {
    const rows = this.db.prepare("SELECT * FROM patterns").all() as Array<{
      name: string;
      required_attributes: string;
      optional_attributes: string;
      confidence_threshold: number;
    }>;
    return rows.map((r) => ({
      name: r.name,
      required_attributes: JSON.parse(r.required_attributes),
      optional_attributes: JSON.parse(r.optional_attributes),
      confidence_threshold: r.confidence_threshold,
    }));
  }

  getPattern(name: string): Pattern | null {
    const row = this.db.prepare("SELECT * FROM patterns WHERE name = ?").get(name) as
      | {
          name: string;
          required_attributes: string;
          optional_attributes: string;
          confidence_threshold: number;
        }
      | undefined;
    if (!row) return null;
    return {
      name: row.name,
      required_attributes: JSON.parse(row.required_attributes),
      optional_attributes: JSON.parse(row.optional_attributes),
      confidence_threshold: row.confidence_threshold,
    };
  }

  inferTypes(doc: Document): InferenceResult[] {
    const patterns = this.getPatterns();
    const results: InferenceResult[] = [];

    for (const pattern of patterns) {
      const totalAttrs =
        Object.keys(pattern.required_attributes).length +
        Object.keys(pattern.optional_attributes).length;
      if (totalAttrs === 0) continue;

      const matched: string[] = [];
      let allRequiredPresent = true;

      for (const [attrName, attrType] of Object.entries(pattern.required_attributes)) {
        if (attrName in doc.attributes) {
          if (this.typeMatches(doc.attributes[attrName], attrType)) {
            matched.push(attrName);
          } else {
            allRequiredPresent = false;
            break;
          }
        } else {
          allRequiredPresent = false;
          break;
        }
      }

      if (!allRequiredPresent) continue;

      for (const [attrName, attrType] of Object.entries(pattern.optional_attributes)) {
        if (attrName in doc.attributes) {
          if (this.typeMatches(doc.attributes[attrName], attrType)) {
            matched.push(attrName);
          }
        }
      }

      const confidence = matched.length / totalAttrs;
      if (confidence >= pattern.confidence_threshold) {
        results.push({
          pattern_name: pattern.name,
          confidence: Math.round(confidence * 10000) / 10000,
          matched_attributes: matched,
        });
      }
    }

    results.sort((a, b) => b.confidence - a.confidence);
    return results;
  }

  private typeMatches(value: unknown, expectedType: string): boolean {
    const typeCheckers: Record<string, (v: unknown) => boolean> = {
      string: (v) => typeof v === "string",
      str: (v) => typeof v === "string",
      number: (v) => typeof v === "number",
      int: (v) => typeof v === "number" && Number.isInteger(v),
      float: (v) => typeof v === "number",
      boolean: (v) => typeof v === "boolean",
      bool: (v) => typeof v === "boolean",
      list: (v) => Array.isArray(v),
      array: (v) => Array.isArray(v),
      dict: (v) => typeof v === "object" && v !== null && !Array.isArray(v),
      object: (v) => typeof v === "object" && v !== null && !Array.isArray(v),
    };
    const checker = typeCheckers[expectedType.toLowerCase()];
    if (!checker) return true; // unknown type = accept
    return checker(value);
  }

  close(): void {
    this.db.close();
  }
}
