#!/usr/bin/env python3
"""List READ operations in the catalog that are not on the executable allowlist."""
import json
import re
from pathlib import Path

d = json.loads(Path("app/src/main/resources/agentapi/operations-v1.json").read_text(encoding="utf-8"))
src = Path("app/src/main/java/com/rentacar/app/agentapi/execution/AgentExecutableAllowlist.kt").read_text(encoding="utf-8")
impl = set(re.findall(r'"([A-Za-z.]+)"', src))
n = 0
for o in d["operations"]:
    if o["readOrWrite"] == "READ" and o["operationId"] not in impl:
        n += 1
        print(
            o["operationId"], "|", o["module"], "|", o["screen"], "|", o["actionName"], "|",
            o["localSupport"], o["cloudSupport"], o["risk"], "|", o["sourceFiles"][:70],
        )
print(n)
