#!/usr/bin/env python3
"""Batch B partial: mark agent.history.reservations + import.log.list IMPLEMENTED with schemas."""
import json
from pathlib import Path

PATH = Path("app/src/main/resources/agentapi/operations-v1.json")
data = json.loads(PATH.read_text(encoding="utf-8"))
ops = {o["operationId"]: o for o in data["operations"]}

SCHEMA_UPDATES = {
    "agent.history.reservations": {
        "properties": {
            "agentId": {"type": "integer", "description": "Internal agent id"},
            "limit": {"type": "integer", "minimum": 1},
            "offset": {"type": "integer", "minimum": 0},
        },
        "required": ["agentId"],
    },
    "import.log.list": {
        "properties": {
            "supplierId": {"type": "integer", "description": "Optional supplier scope"},
            "query": {"type": "string", "description": "Optional file name search"},
            "limit": {"type": "integer", "minimum": 1},
            "offset": {"type": "integer", "minimum": 0},
        },
        "required": [],
    },
}

for oid, spec in SCHEMA_UPDATES.items():
    op = ops[oid]
    schema = dict(op.get("inputSchema") or {})
    schema["type"] = "object"
    schema["additionalProperties"] = False
    schema["properties"] = spec["properties"]
    schema["required"] = spec["required"]
    schema["notes"] = "Parameters are explicitly declared only. Arbitrary SQL and method names are rejected."
    op["inputSchema"] = schema
    op["implementationStatus"] = "IMPLEMENTED"
    op["executable"] = False

PATH.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
print("implemented", sum(1 for o in data["operations"] if o.get("implementationStatus") == "IMPLEMENTED"))
