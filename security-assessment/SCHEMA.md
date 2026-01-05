# Security Assessment JSON Schema

This document describes the JSON schema for ASVS security assessment reports.

## Report Structure

```typescript
interface Report {
  timestamp: string;      // ISO 8601 timestamp
  version: string;        // Project version from package.json
  summary: Summary;
  checks: CheckResult[];
}

interface Summary {
  total: number;          // Total number of checks
  passed: number;         // Checks with status "pass"
  failed: number;         // Checks with status "fail"
  warnings: number;       // Checks with status "warning"
}

interface CheckResult {
  id: string;             // Unique check ID (e.g., "V2.1.1")
  category: string;       // ASVS category (e.g., "V2 Authentication")
  name: string;           // Human-readable check name
  status: Status;         // Result status
  description: string;    // What this check verifies
  locations?: Location[]; // Where patterns were found
  remediation?: string;   // How to fix (if failed/warning)
  asvsRef: string;        // ASVS reference (e.g., "V2.1.1")
}

type Status = 'pass' | 'fail' | 'warning' | 'info';

interface Location {
  file: string;           // Relative file path
  line: number;           // Line number (1-indexed)
  snippet?: string;       // Code snippet (truncated to 100 chars)
}
```

## JSON Schema (Draft-07)

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "ASVS Security Assessment Report",
  "type": "object",
  "required": ["timestamp", "version", "summary", "checks"],
  "properties": {
    "timestamp": {
      "type": "string",
      "format": "date-time",
      "description": "ISO 8601 timestamp when the report was generated"
    },
    "version": {
      "type": "string",
      "description": "Project version from package.json"
    },
    "summary": {
      "type": "object",
      "required": ["total", "passed", "failed", "warnings"],
      "properties": {
        "total": {
          "type": "integer",
          "minimum": 0,
          "description": "Total number of checks run"
        },
        "passed": {
          "type": "integer",
          "minimum": 0,
          "description": "Number of checks that passed"
        },
        "failed": {
          "type": "integer",
          "minimum": 0,
          "description": "Number of checks that failed"
        },
        "warnings": {
          "type": "integer",
          "minimum": 0,
          "description": "Number of checks with warnings"
        }
      }
    },
    "checks": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["id", "category", "name", "status", "description", "asvsRef"],
        "properties": {
          "id": {
            "type": "string",
            "pattern": "^V?[0-9]+\\.?[0-9]*\\.?[0-9]*$|^CUSTOM-[0-9]+$",
            "description": "Unique check identifier"
          },
          "category": {
            "type": "string",
            "enum": [
              "V2 Authentication",
              "V3 Session Management",
              "V4 Access Control",
              "V5 Validation",
              "V7 Error Handling",
              "V8 Data Protection",
              "V9 Communication",
              "V10 Malicious Code"
            ],
            "description": "ASVS category"
          },
          "name": {
            "type": "string",
            "minLength": 1,
            "description": "Human-readable name for the check"
          },
          "status": {
            "type": "string",
            "enum": ["pass", "fail", "warning", "info"],
            "description": "Result of the check"
          },
          "description": {
            "type": "string",
            "description": "Explanation of what was checked"
          },
          "locations": {
            "type": "array",
            "items": {
              "type": "object",
              "required": ["file", "line"],
              "properties": {
                "file": {
                  "type": "string",
                  "description": "Relative path to the file"
                },
                "line": {
                  "type": "integer",
                  "minimum": 1,
                  "description": "Line number (1-indexed)"
                },
                "snippet": {
                  "type": "string",
                  "maxLength": 100,
                  "description": "Code snippet from that line"
                }
              }
            }
          },
          "remediation": {
            "type": "string",
            "description": "Instructions for fixing the issue"
          },
          "asvsRef": {
            "type": "string",
            "description": "ASVS requirement reference"
          }
        }
      }
    }
  }
}
```

## Example Report

```json
{
  "timestamp": "2025-01-05T10:30:00.000Z",
  "version": "1.2.0",
  "summary": {
    "total": 12,
    "passed": 9,
    "failed": 1,
    "warnings": 2
  },
  "checks": [
    {
      "id": "V2.1.1",
      "category": "V2 Authentication",
      "name": "Password Hashing",
      "status": "pass",
      "description": "Passwords must be hashed using approved algorithms with salt",
      "locations": [
        {
          "file": "src/lib/server/auth.ts",
          "line": 42,
          "snippet": "const hash = await crypto.subtle.digest('SHA-256', data);"
        }
      ],
      "asvsRef": "V2.1.1"
    },
    {
      "id": "V5.3.4",
      "category": "V5 Validation",
      "name": "SQL Injection Prevention",
      "status": "fail",
      "description": "Use parameterized queries to prevent SQL injection",
      "locations": [
        {
          "file": "src/routes/api/users/+server.ts",
          "line": 15,
          "snippet": "db.execute(`SELECT * FROM users WHERE id = ${userId}`);"
        }
      ],
      "asvsRef": "V5.3.4",
      "remediation": "Replace raw SQL with parameterized queries:\n```typescript\ndb.prepare('SELECT * FROM users WHERE id = ?').bind(userId);\n```"
    }
  ]
}
```

## Status Definitions

| Status | Meaning | Display Color |
|--------|---------|---------------|
| `pass` | Check passed, requirement met | Green |
| `fail` | Check failed, security issue found | Red |
| `warning` | Pattern not found, review recommended | Amber/Yellow |
| `info` | Informational only, no action required | Blue |

## Category Order

For consistent display, use this category order:

```typescript
const categoryOrder = [
  'V2 Authentication',
  'V3 Session Management',
  'V4 Access Control',
  'V5 Validation',
  'V7 Error Handling',
  'V8 Data Protection',
  'V9 Communication',
  'V10 Malicious Code',
];
```

## Calculating Compliance Score

```typescript
const score = Math.round((summary.passed / summary.total) * 100);
```

The score represents the percentage of checks that passed. Warnings are not counted as failures but are excluded from the passing count.
