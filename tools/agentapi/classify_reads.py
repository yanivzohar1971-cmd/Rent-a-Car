#!/usr/bin/env python3
"""Generate docs/agent-api/READ-ELIGIBILITY.md from the catalog + allowlist.

Statuses:
  IMPLEMENTED   - on the executable allowlist (earlier batches or Batch B partial)
  ELIGIBLE      - safe to expose as a read later; not implemented, blocker listed
  NOT_ELIGIBLE  - must not be exposed as an agent read tool
"""
import json
import re
from pathlib import Path

catalog = json.loads(Path("app/src/main/resources/agentapi/operations-v1.json").read_text(encoding="utf-8"))
allow_src = Path("app/src/main/java/com/rentacar/app/agentapi/execution/AgentExecutableAllowlist.kt").read_text(encoding="utf-8")
allowlisted = set(re.findall(r'"([A-Za-z.]+)"', allow_src))

NAV = "UI navigation / screen state only; returns no business data"
SHARE = "Share/export intent or file generation: side effect outside the API (OS share, files) and bulk PII dump"
CLOUD_ONLY = "Cloud-only/admin or auth operation; no Android local executor and out of scope for agent reads"

SPECIAL = {
    "reservation.terms.effective": ("ELIGIBLE", "Read-only, but `CustomerTermsRepository` resolves uid via global `CurrentUserProvider.requireCurrentUid()`, which is not the gateway-bound uid. Needs a uid-parameterized terms read port (DAO has uid-scoped `getTerms`/`getCustomization`) plus reservationId→supplierId and language params."),
    "terms.load.effective": ("ELIGIBLE", "Same blocker as `reservation.terms.effective`: repository uses global current-user state. Needs uid-parameterized port + params `supplierId`, `language`."),
    "settings.sync.check": ("ELIGIBLE", "`DataSyncCheckRepository` compares local vs cloud counts and calls the cloud. A safe version would be a local-counts-only port reporting `syncStatus=UNKNOWN`; not implemented to avoid implying sync verification or triggering network I/O."),
    "priceList.details.view": ("ELIGIBLE", "Local Room reads (price list groups/models). Needs a dedicated read port and DTOs; large payloads need pagination."),
    "document.list": ("ELIGIBLE", "Metadata store + filesystem listing on the device. Needs a port that never exposes absolute paths or file contents."),
    "yard.smartPublish.load": ("ELIGIBLE", "Candidates derive from fleet/yard data (partly cloud). Needs a fleet-scoped port; defer until yard cloud semantics are defined."),
    "dashboard.list.openReservations": ("IMPLEMENTED", "AGENT-018"),
    "agent.history.reservations": ("IMPLEMENTED", "Batch B: reuses `reservationsByAgent` (param `agentId`, pagination)."),
    "import.log.list": ("IMPLEMENTED", "Batch B: uid-scoped import run headers via `ImportLogReadPort`; entries and file hash intentionally excluded."),
    "debug.db.browse": ("NOT_ELIGIBLE", "Raw Room table browser (CRITICAL). Never expose."),
    "settings.debug.dbBrowser": ("NOT_ELIGIBLE", "Opens the raw DB browser. Never expose."),
    "recon.email.search": ("NOT_ELIGIBLE", "Searches the user's mailbox (external account access, PII, network)."),
    "recon.email.preview": ("NOT_ELIGIBLE", "Reads email attachments/content from the user's mailbox."),
    "recon.preview.run": ("NOT_ELIGIBLE", "Requires an uploaded file/in-memory import session and computes against UI state; not a stateless read."),
    "recon.history.open": ("NOT_ELIGIBLE", "Opens a historical import in the UI. Underlying data could become a future dedicated `import.log.entries` read."),
    "document.preview": ("NOT_ELIGIBLE", "Renders file content on screen (filesystem/PII)."),
    "document.share": ("NOT_ELIGIBLE", SHARE),
    "document.sort": ("NOT_ELIGIBLE", "UI sort state only"),
    "priceList.details.filter": ("NOT_ELIGIBLE", "UI filter state; use `priceList.details.view` with parameters if that op is ever implemented."),
    "yard.smartPublish.select": ("NOT_ELIGIBLE", "UI selection state"),
    "yard.profile.load": ("NOT_ELIGIBLE", "Cloud-only yard profile; no local executor and cloud reads are not activated."),
    "yard.home.view": ("NOT_ELIGIBLE", NAV),
    "recon.setup.open": ("NOT_ELIGIBLE", NAV),
    "recon.filter.sort": ("NOT_ELIGIBLE", "UI filter/sort/selection state"),
    "report.monthly.navigateMonth": ("NOT_ELIGIBLE", "UI month navigation; `report.monthly.view` already takes year/month"),
}


def classify(op):
    oid = op["operationId"]
    if oid in SPECIAL:
        return SPECIAL[oid]
    if oid in allowlisted:
        return ("IMPLEMENTED", "")
    if ".navigate." in oid or oid.endswith(".navigate") or oid in (
        "dashboard.open.reservation", "commission.manage.open", "agent.navigate.lockedManage",
        "reservation.lock.agent", "import.commission.navigate", "settings.dataManagement.open",
    ):
        return ("NOT_ELIGIBLE", NAV)
    if oid.startswith(("export.", "recon.export.", "reservation.share.")) or oid in (
        "reservation.export.excel", "commission.export.smartExcel", "report.stub.csv",
    ):
        return ("NOT_ELIGIBLE", SHARE)
    if oid.startswith(("admin.", "auth.")):
        return ("NOT_ELIGIBLE", CLOUD_ONLY)
    return ("NOT_ELIGIBLE", "Unclassified; defaults to NOT_ELIGIBLE until reviewed")


rows = []
for op in catalog["operations"]:
    if op["readOrWrite"] != "READ":
        continue
    status, note = classify(op)
    rows.append((op["operationId"], op["module"], status, note))

implemented = [r for r in rows if r[2] == "IMPLEMENTED"]
remaining = [r for r in rows if r[2] != "IMPLEMENTED"]
eligible = [r for r in remaining if r[2] == "ELIGIBLE"]
not_eligible = [r for r in remaining if r[2] == "NOT_ELIGIBLE"]

lines = [
    "# READ-ELIGIBILITY — remaining read operations",
    "",
    "Generated by `tools/agentapi/classify_reads.py` from `operations-v1.json` and `AgentExecutableAllowlist`.",
    "Re-run `python tools/agentapi/classify_reads.py` after changing the catalog or allowlist.",
    "",
    "| Metric | Count |",
    "|--------|------:|",
    f"| READ operations in catalog | {len(rows)} |",
    f"| IMPLEMENTED (executable allowlist) | {len(implemented)} |",
    f"| Remaining reads | {len(remaining)} |",
    f"| &nbsp;&nbsp;ELIGIBLE (not implemented, blocker listed) | {len(eligible)} |",
    f"| &nbsp;&nbsp;NOT_ELIGIBLE | {len(not_eligible)} |",
    "",
    "Before Batch B-partial the remaining count was **74**; `agent.history.reservations` and `import.log.list` were",
    "implemented in this batch (**72** remain).",
    "",
    "## Batch B-partial decisions",
    "",
    "| Operation | Decision |",
    "|-----------|----------|",
    "| `agent.history.reservations` | **Implemented** — reuses `reservationsByAgent`; `agentId` + pagination. |",
    "| `import.log.list` | **Implemented** — `DaoImportLogReadPort` over `ImportLogDao.getRunsForSupplier` (uid-scoped); optional `supplierId`, `query`, pagination; no entries/file hash. |",
    "| `terms.load.effective`, `reservation.terms.effective` | **Blocked** — repository uses global `CurrentUserProvider`, not the bound uid; needs a uid-parameterized port. |",
    "| `settings.sync.check` | **Blocked/deferred** — existing logic compares with the cloud; a metadata-only version would add no verified information. |",
    "",
    "## ELIGIBLE (candidates, not implemented)",
    "",
    "| Operation | Module | Blocker / note |",
    "|-----------|--------|----------------|",
]
lines += [f"| `{o}` | {m} | {n} |" for o, m, s, n in eligible]
lines += [
    "",
    "## NOT_ELIGIBLE",
    "",
    "| Operation | Module | Reason |",
    "|-----------|--------|--------|",
]
lines += [f"| `{o}` | {m} | {n} |" for o, m, s, n in not_eligible]
lines += [
    "",
    "## IMPLEMENTED reads",
    "",
    ", ".join(f"`{o}`" for o, *_ in implemented),
    "",
]
Path("docs/agent-api/READ-ELIGIBILITY.md").write_text("\n".join(lines), encoding="utf-8")
print(len(rows), len(implemented), len(remaining), len(eligible), len(not_eligible))
