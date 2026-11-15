#!/usr/bin/env python3
"""Update catalog schemas + mark ops IMPLEMENTED for AGENT-014..018 batch."""
import json
from pathlib import Path

PATH = Path("app/src/main/resources/agentapi/operations-v1.json")
data = json.loads(PATH.read_text(encoding="utf-8"))
ops = {o["operationId"]: o for o in data["operations"]}

SCHEMA_UPDATES = {
    "commission.installments.list": {
        "payoutMonth": {"type": "string", "description": "Required payout month YYYY-MM"},
        "supplierId": {"type": "integer", "description": "Optional supplier filter"},
        "query": {"type": "string", "description": "Optional search text"},
        "limit": {"type": "integer", "minimum": 1},
        "offset": {"type": "integer", "minimum": 0},
    },
    "commission.summary.totals": {
        "payoutMonth": {"type": "string", "description": "Required payout month YYYY-MM"},
        "supplierId": {"type": "integer", "description": "Optional supplier filter"},
    },
    "commission.filter.payoutMonth": {
        "payoutMonth": {"type": "string", "description": "Required payout month YYYY-MM"},
        "supplierId": {"type": "integer", "description": "Optional supplier filter"},
        "limit": {"type": "integer", "minimum": 1},
        "offset": {"type": "integer", "minimum": 0},
    },
    "carSale.list": {
        "query": {"type": "string"},
        "commissionFilter": {
            "type": "string",
            "description": "ALL|OPEN|CLOSED — Sales Management commission collection filter",
        },
        "limit": {"type": "integer", "minimum": 1},
        "offset": {"type": "integer", "minimum": 0},
    },
    "carSale.commission.totals": {
        "commissionFilter": {
            "type": "string",
            "description": "ALL|OPEN|CLOSED — filter-scoped totals",
        },
        "query": {"type": "string"},
    },
    "report.monthly.view": {
        "supplierId": {"type": "integer", "description": "Supplier id"},
        "year": {"type": "integer"},
        "month": {"type": "integer"},
    },
    "branch.list": {
        "supplierId": {"type": "integer", "description": "Optional supplier scope"},
        "query": {"type": "string"},
        "limit": {"type": "integer", "minimum": 1},
        "offset": {"type": "integer", "minimum": 0},
    },
    "reservation.list.byCustomer": {
        "customerId": {"type": "integer"},
        "limit": {"type": "integer", "minimum": 1},
        "offset": {"type": "integer", "minimum": 0},
    },
    "reservation.list.bySupplier": {
        "supplierId": {"type": "integer"},
        "limit": {"type": "integer", "minimum": 1},
        "offset": {"type": "integer", "minimum": 0},
    },
    "reservation.list.byAgent": {
        "agentId": {"type": "integer"},
        "limit": {"type": "integer", "minimum": 1},
        "offset": {"type": "integer", "minimum": 0},
    },
    "reservation.list.byBranch": {
        "branchId": {"type": "integer"},
        "limit": {"type": "integer", "minimum": 1},
        "offset": {"type": "integer", "minimum": 0},
    },
    "reservation.payment.list": {
        "reservationId": {"type": "integer"},
        "limit": {"type": "integer", "minimum": 1},
        "offset": {"type": "integer", "minimum": 0},
    },
    "reservation.filter.dateRange": {
        "fromEpochMs": {"type": "integer", "description": "createdAt lower bound inclusive"},
        "toEpochMs": {"type": "integer", "description": "createdAt upper bound inclusive"},
        "query": {"type": "string"},
        "limit": {"type": "integer", "minimum": 1},
        "offset": {"type": "integer", "minimum": 0},
    },
    "reservation.filter.supplier": {
        "supplierId": {"type": "integer"},
        "query": {"type": "string"},
        "limit": {"type": "integer", "minimum": 1},
        "offset": {"type": "integer", "minimum": 0},
    },
    "reservation.filter.status": {
        "status": {"type": "string", "description": "ReservationStatus name"},
        "query": {"type": "string"},
        "limit": {"type": "integer", "minimum": 1},
        "offset": {"type": "integer", "minimum": 0},
    },
    "customer.history.reservations": {
        "customerId": {"type": "integer"},
        "limit": {"type": "integer", "minimum": 1},
        "offset": {"type": "integer", "minimum": 0},
    },
    "customer.details.view": {
        "id": {"type": "integer", "description": "Internal customer id"},
    },
    "priceList.list": {
        "supplierId": {"type": "integer"},
        "query": {"type": "string"},
        "limit": {"type": "integer", "minimum": 1},
        "offset": {"type": "integer", "minimum": 0},
    },
    "yard.fleet.filter": {
        "query": {"type": "string"},
        "status": {"type": "string", "description": "DRAFT|HIDDEN|PUBLISHED"},
        "limit": {"type": "integer", "minimum": 1},
        "offset": {"type": "integer", "minimum": 0},
    },
}

REQUIRED = {
    "commission.installments.list": ["payoutMonth"],
    "commission.summary.totals": ["payoutMonth"],
    "commission.filter.payoutMonth": ["payoutMonth"],
    "report.monthly.view": ["supplierId", "year", "month"],
    "reservation.list.byCustomer": ["customerId"],
    "reservation.list.bySupplier": ["supplierId"],
    "reservation.list.byAgent": ["agentId"],
    "reservation.list.byBranch": ["branchId"],
    "reservation.payment.list": ["reservationId"],
    "reservation.filter.supplier": ["supplierId"],
    "reservation.filter.status": ["status"],
    "customer.history.reservations": ["customerId"],
    "customer.details.view": ["id"],
}

IMPLEMENT = [
    # 014
    "commission.installments.list",
    "commission.summary.totals",
    "commission.filter.payoutMonth",
    "commission.alignment.preview",
    # 015
    "carSale.list",
    "carSale.commission.totals",
    "request.list",
    # 016
    "yard.fleet.list",
    "yard.fleet.filter",
    # 017
    "report.monthly.view",
    # 018
    "agent.list",
    "branch.list",
    "supplier.pick",
    "priceList.list",
    "reservation.list.byCustomer",
    "reservation.list.bySupplier",
    "reservation.list.byAgent",
    "reservation.list.byBranch",
    "reservation.payment.list",
    "reservation.filter.dateRange",
    "reservation.filter.supplier",
    "reservation.filter.status",
    "dashboard.list.openReservations",
    "customer.history.reservations",
    "customer.details.view",
]

for oid, props in SCHEMA_UPDATES.items():
    op = ops[oid]
    schema = dict(op.get("inputSchema") or {})
    schema["type"] = "object"
    schema["additionalProperties"] = False
    schema["properties"] = props
    schema["required"] = REQUIRED.get(oid, [])
    schema["notes"] = "Parameters are explicitly declared only. Arbitrary SQL and method names are rejected."
    op["inputSchema"] = schema

for oid in IMPLEMENT:
    op = ops[oid]
    op["implementationStatus"] = "IMPLEMENTED"
    op["executable"] = False

PATH.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
implemented = sum(1 for o in data["operations"] if o.get("implementationStatus") == "IMPLEMENTED")
print("implemented", implemented)
print("batch", len(IMPLEMENT))
