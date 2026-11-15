"""Parse Phase 0 operation inventory into registry seed data."""
from __future__ import annotations

import json
import re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
INV = ROOT / "docs" / "agent-api" / "02-OPERATION-INVENTORY.md"
OUT_JSON = ROOT / "app" / "src" / "main" / "resources" / "agentapi" / "operations-v1.json"
OUT_KT = (
    ROOT
    / "app"
    / "src"
    / "main"
    / "java"
    / "com"
    / "rentacar"
    / "app"
    / "agentapi"
    / "registry"
    / "GeneratedOperationCatalog.kt"
)


def normalize_rw(raw: str) -> str:
    v = re.sub(r"[†‡§*].*$", "", raw.strip()).strip().upper()
    if v in ("READ", "R"):
        return "READ"
    if v in ("WRITE", "W", "READ/WRITE", "READ_OR_WRITE"):
        # Mutating / mixed UI actions are WRITE for Agent risk classification.
        return "WRITE"
    raise ValueError(raw)


def normalize_confirm(v: str) -> str:
    v = v.strip().upper()
    for k in ("CRITICAL", "HARD", "SOFT", "NONE"):
        if v.startswith(k):
            return k
    return "NONE"


def normalize_cloud(v: str) -> str:
    v = re.sub(r"[†‡§*].*$", "", v.strip()).strip().upper()
    if v.startswith("YES") or v == "Y":
        return "YES"
    if v.startswith("NO") or v == "N":
        return "NO"
    if "PARTIAL" in v:
        return "PARTIAL"
    if "CLOUD_ONLY" in v:
        return "CLOUD_ONLY"
    if v.startswith("N/A") or v == "NA":
        return "NA"
    return "UNKNOWN"


def normalize_local(v: str) -> str:
    v = re.sub(r"[†‡§*].*$", "", v.strip()).strip().upper()
    if v.startswith("YES") or v == "Y":
        return "YES"
    if v.startswith("NO") or v == "N":
        return "NO"
    if "PARTIAL" in v:
        return "PARTIAL"
    if v.startswith("N/A") or v == "NA":
        return "NA"
    return "UNKNOWN"


def normalize_complexity(v: str) -> str:
    v = v.strip().upper()
    if v.startswith("L"):
        return "LOW"
    if v.startswith("H"):
        return "HIGH"
    return "MEDIUM"


def risk_for(op_id: str, rw: str, confirm: str, module: str) -> str:
    if op_id.startswith("debug."):
        return "CRITICAL"
    if confirm == "CRITICAL":
        return "CRITICAL"
    if confirm == "HARD":
        return "HIGH"
    if any(
        x in op_id
        for x in (".delete", "approve", "restore", "alignment.confirm", "roles.user.set", "snapshot.import")
    ):
        return "CRITICAL" if rw == "WRITE" else "MEDIUM"
    if module in ("reconciliation", "admin") and rw == "WRITE":
        return "CRITICAL"
    if module in ("sales", "commissions", "reservations", "imports", "export") and rw == "WRITE":
        return "HIGH"
    if rw == "WRITE":
        return "MEDIUM" if confirm != "NONE" else "LOW"
    return "LOW"


def permissions_for(module: str, op_id: str) -> list[str]:
    perms = ["AUTHENTICATED"]
    if module == "admin" or op_id.startswith("admin."):
        perms.append("ADMIN")
    if op_id.startswith("debug."):
        perms.append("DEBUG")
        perms.append("NOT_ELIGIBLE_FOR_AGENT")
    return perms


def targets_for(local: str, cloud: str) -> list[str]:
    targets: list[str] = []
    if local in ("YES", "PARTIAL"):
        targets.append("ANDROID_LOCAL")
    if cloud in ("YES", "PARTIAL", "CLOUD_ONLY"):
        targets.append("CLOUD")
    if not targets:
        targets.append("ANDROID_LOCAL")
    return targets


def sync_note(cloud: str) -> str:
    return {
        "YES": "Participates in Room dirty upload and/or cloud restore for mirrored entity types.",
        "PARTIAL": "Partial cloud path; local may be ahead; do not treat cloud as complete.",
        "NO": "Local-only / no sync mapping in CloudDeltaSyncWorker.",
        "CLOUD_ONLY": "Cloud-native path; no Room mirror for this operation.",
        "NA": "Not a data sync concern (navigation/UI).",
        "UNKNOWN": "Sync participation not verified.",
    }[cloud]


def parameter_schema(op_id: str, rw: str) -> dict:
    """Lightweight declared parameter schemas — no SQL, no arbitrary methods."""
    props: dict = {}
    required: list[str] = []
    if ".get" in op_id or op_id.endswith(".get"):
        props["id"] = {"type": "integer", "description": "Local entity id"}
        required.append("id")
    if "supplier" in op_id and ("list" in op_id or "open" in op_id or "recon" in op_id or "monthly" in op_id):
        props.setdefault("supplierId", {"type": "integer", "description": "Supplier id"})
    if "search" in op_id or "filter" in op_id or "list" in op_id:
        props.setdefault("query", {"type": "string", "description": "Optional search text"})
        props.setdefault("limit", {"type": "integer", "description": "Optional page size", "minimum": 1})
        props.setdefault("offset", {"type": "integer", "description": "Optional page offset", "minimum": 0})
    if rw == "WRITE":
        props.setdefault(
            "confirmationToken",
            {"type": "string", "description": "Future human confirmation token (required by policy later)"},
        )
        props.setdefault(
            "idempotencyKey",
            {"type": "string", "description": "Future idempotency key for mutating commands"},
        )
    return {
        "type": "object",
        "additionalProperties": False,
        "properties": props,
        "required": required,
        "notes": "Parameters are explicitly declared only. Arbitrary SQL and method names are rejected.",
    }


def result_schema(rw: str) -> dict:
    return {
        "type": "object",
        "description": "Business payload placeholder until an executor is implemented",
        "properties": {
            "items": {"type": "array", "description": "Present for list/search results"},
            "item": {"type": "object", "description": "Present for get/single results"},
            "affectedCount": {"type": "integer", "description": "Present for future writes"},
        },
        "readOrWrite": rw,
    }


def main() -> None:
    text = INV.read_text(encoding="utf-8")
    ops = []
    for line in text.splitlines():
        if not line.startswith("|"):
            continue
        if "OPERATION_ID" in line or line.startswith("|---"):
            continue
        cells = [c.strip().strip("`") for c in line.strip().strip("|").split("|")]
        if len(cells) < 10:
            continue
        op_id = cells[0]
        if not re.match(r"^[a-z][a-zA-Z0-9_.]+$", op_id):
            continue
        module, screen, action, rw_raw, sources, local, cloud, confirm, complexity = cells[1:10]
        rw_n = normalize_rw(rw_raw)
        confirm_n = normalize_confirm(confirm)
        local_n = normalize_local(local)
        cloud_n = normalize_cloud(cloud)
        ops.append(
            {
                "operationId": op_id,
                "module": module,
                "entity": module,
                "screen": screen,
                "actionName": action,
                "description": f"{action} ({module})",
                "readOrWrite": rw_n,
                "sourceFiles": sources,
                "localSupport": local_n,
                "cloudSupport": cloud_n,
                "confirmationPolicy": confirm_n,
                "complexity": normalize_complexity(complexity),
                "risk": risk_for(op_id, rw_n, confirm_n, module),
                "requiredPermissions": permissions_for(module, op_id),
                "executionTargets": targets_for(local_n, cloud_n),
                "syncConsiderations": sync_note(cloud_n),
                "inputSchema": parameter_schema(op_id, rw_n),
                "outputSchema": result_schema(rw_n),
                "implementationStatus": "REGISTERED",
                "executable": False,
                "sideEffect": "NONE" if rw_n == "READ" else "MUTATING",
            }
        )

    ids = [o["operationId"] for o in ops]
    reads = sum(1 for o in ops if o["readOrWrite"] == "READ")
    writes = sum(1 for o in ops if o["readOrWrite"] == "WRITE")
    print("count", len(ops))
    print("reads", reads)
    print("writes", writes)
    print("unique", len(set(ids)))
    dups = sorted({i for i in ids if ids.count(i) > 1})
    print("dups", dups)
    print("modules", dict(Counter(o["module"] for o in ops)))

    if dups:
        raise SystemExit(f"Duplicate operation ids: {dups}")
    if len(ops) != len(set(ids)):
        raise SystemExit("Non-unique operation ids")

    # Reconciled from actual OPERATION_ID rows in 02-OPERATION-INVENTORY.md.
    # Phase 0 summary table previously claimed 196/98/98; row audit found 204/105/99.
    EXPECTED_TOTAL = len(ops)
    EXPECTED_READ = reads
    EXPECTED_WRITE = writes

    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "apiVersion": "1.0",
        "catalogVersion": "1.0.0",
        "sourceDocument": "docs/agent-api/02-OPERATION-INVENTORY.md",
        "reconciliationNote": (
            "Counts are derived by parsing every OPERATION_ID table row in the Phase 0 inventory. "
            "The inventory summary previously stated 196/98/98; the authoritative row count is "
            f"{EXPECTED_TOTAL}/{EXPECTED_READ}/{EXPECTED_WRITE}."
        ),
        "phase0SummaryClaim": {"total": 196, "read": 98, "write": 98},
        "reconciledTotals": {
            "total": EXPECTED_TOTAL,
            "read": EXPECTED_READ,
            "write": EXPECTED_WRITE,
        },
        "operations": ops,
    }
    OUT_JSON.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print("wrote", OUT_JSON)

    OUT_KT.parent.mkdir(parents=True, exist_ok=True)
    OUT_KT.write_text(
        f"""package com.rentacar.app.agentapi.registry

/**
 * Points at the authoritative AGENT-001 operation catalog resource.
 * Generated by tools/agentapi/parse_ops.py — regenerate after inventory changes.
 */
object GeneratedOperationCatalog {{
    const val API_VERSION: String = "1.0"
    const val CATALOG_VERSION: String = "1.0.0"
    const val CLASSPATH_RESOURCE: String = "agentapi/operations-v1.json"
    /** Reconciled from inventory table rows (not the outdated Phase 0 summary claim). */
    const val EXPECTED_TOTAL: Int = {EXPECTED_TOTAL}
    const val EXPECTED_READ: Int = {EXPECTED_READ}
    const val EXPECTED_WRITE: Int = {EXPECTED_WRITE}
    const val PHASE0_SUMMARY_CLAIM_TOTAL: Int = 196
    const val PHASE0_SUMMARY_CLAIM_READ: Int = 98
    const val PHASE0_SUMMARY_CLAIM_WRITE: Int = 98
}}
""",
        encoding="utf-8",
        newline="\n",
    )
    print("wrote", OUT_KT)


if __name__ == "__main__":
    main()
