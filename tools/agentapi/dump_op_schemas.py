#!/usr/bin/env python3
import json
from pathlib import Path

ops = {
    o["operationId"]: o
    for o in json.loads(Path("app/src/main/resources/agentapi/operations-v1.json").read_text(encoding="utf-8"))[
        "operations"
    ]
}
ids = [
    "commission.installments.list",
    "commission.summary.totals",
    "commission.filter.payoutMonth",
    "commission.alignment.preview",
    "carSale.list",
    "carSale.commission.totals",
    "request.list",
    "branch.list",
    "agent.list",
    "reservation.list.byCustomer",
    "reservation.list.bySupplier",
    "reservation.list.byAgent",
    "reservation.list.byBranch",
    "reservation.payment.list",
    "reservation.filter.dateRange",
    "reservation.filter.supplier",
    "reservation.filter.status",
    "customer.history.reservations",
    "customer.details.view",
    "supplier.pick",
    "dashboard.list.openReservations",
    "priceList.list",
    "yard.fleet.list",
    "report.monthly.view",
    "recon.history.open",
]
for i in ids:
    o = ops.get(i)
    if not o:
        print(i, "MISSING")
        continue
    schema = o.get("inputSchema") or {}
    props = list((schema.get("properties") or {}).keys())
    print(f"{i}")
    print(f"  screen={o.get('screen')}")
    print(f"  src={o.get('sourceFiles')}")
    print(f"  params={props} required={schema.get('required')}")
    print()
