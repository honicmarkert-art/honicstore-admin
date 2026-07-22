"""Rewrite TSP X-ray repair invoice as two professional tables: Services + Components."""
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from urllib import error, parse, request

INVOICE_NUMBER = "INV-2026-TSP-XRAY-PSU"
REFERENCE = "TR-2026-0001"
ISSUE_DATE = "2026-07-22"
DUE_DATE = "2026-08-21"
CLIENT_NAME = "Tanzania Steel Pipes Limited"
CLIENT_ADDRESS = (
    "Plot 4, Ubungo Industrial Estate\n"
    "Morogoro Road\n"
    "P.O. Box 5476\n"
    "Dar es Salaam, Tanzania\n"
    "Tel: +255 (0)22-2450457\n"
    "Email: info@tsp.co.tz"
)
STAMP_PUBLIC_URL = (
    "https://qobobocldfjhdkpjyuuq.supabase.co/storage/v1/object/public/"
    "invoice-assets/invoices/admin/stamp/company-stamp.jpg"
)
SIGNATURE_PUBLIC_URL = (
    "https://qobobocldfjhdkpjyuuq.supabase.co/storage/v1/object/public/"
    "invoice-assets/invoices/admin/signature/prepared-by-signature-white-v2.png"
)

# Two tables: Service charges + Components (concise professional lines).
SERVICE_ROWS = [
    {
        "sn": "1",
        "item": "Technical diagnostics & inspection (Ukaguzi) — fixed, non-refundable",
        "qty": "1",
        "amount": "300000",
    },
    {
        "sn": "2",
        "item": "Electronic repair labour — 5V PSU replacement; 27V/15V circuit repair; testing",
        "qty": "1",
        "amount": "800000",
    },
]

COMPONENT_ROWS = [
    {
        "sn": "1",
        "item": "5V / 7A PSU — SunPower SPS-035-05 or Mean Well LRS-35-5 (or equiv.)",
        "qty": "1",
        "unitPrice": "110400",
        "totalPrice": "110400",
    },
    {
        "sn": "2",
        "item": "Regulator LM2577",
        "qty": "1",
        "unitPrice": "12000",
        "totalPrice": "12000",
    },
    {
        "sn": "3",
        "item": "Regulator LM2576",
        "qty": "2",
        "unitPrice": "12000",
        "totalPrice": "24000",
    },
    {
        "sn": "4",
        "item": "Schottky diode 1N5821",
        "qty": "2",
        "unitPrice": "2500",
        "totalPrice": "5000",
    },
]


def load_env(env_path: Path) -> None:
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def supabase_request(method: str, url: str, apikey: str, body=None):
    headers = {"apikey": apikey, "Authorization": f"Bearer {apikey}"}
    data = None
    if body is not None:
        headers["Content-Type"] = "application/json"
        headers["Prefer"] = "return=representation"
        data = json.dumps(body).encode("utf-8")
    req = request.Request(url, method=method, headers=headers, data=data)
    try:
        with request.urlopen(req) as resp:
            raw = resp.read().decode("utf-8")
            return resp.status, json.loads(raw) if raw else None
    except error.HTTPError as e:
        raw = e.read().decode("utf-8")
        try:
            payload = json.loads(raw)
        except Exception:
            payload = {"error": raw}
        return e.code, payload


def find_existing(base_url: str, apikey: str, invoice_number: str):
    safe = parse.quote(invoice_number, safe="")
    status, data = supabase_request(
        "GET",
        f"{base_url}/rest/v1/invoices?select=id&invoice_number=eq.{safe}&limit=1",
        apikey,
    )
    if status >= 400 or not isinstance(data, list) or not data:
        return None
    return data[0]


def find_report(base_url: str, apikey: str, report_number: str):
    safe = parse.quote(report_number, safe="")
    status, data = supabase_request(
        "GET",
        f"{base_url}/rest/v1/invoices?select=id,payload&invoice_number=eq.{safe}&limit=1",
        apikey,
    )
    if status >= 400 or not isinstance(data, list) or not data:
        return None
    return data[0]


def main():
    repo_root = Path(__file__).resolve().parents[1]
    load_env(repo_root / ".env.local")
    base = os.getenv("NEXT_PUBLIC_SUPABASE_URL", "").rstrip("/")
    apikey = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
    if not base or not apikey:
        raise SystemExit("Missing Supabase env vars")

    service_total = sum(float(r["amount"]) * float(r["qty"]) for r in SERVICE_ROWS)
    parts_total = sum(float(r["totalPrice"]) for r in COMPONENT_ROWS)
    grand_total = service_total + parts_total

    sections = [
        {
            "title": "SERVICE CHARGES",
            "columns": [
                {"key": "sn", "label": "S/N"},
                {"key": "item", "label": "Description"},
                {"key": "qty", "label": "Qty"},
                {"key": "amount", "label": "Amount (TZS)"},
            ],
            "rows": SERVICE_ROWS,
        },
        {
            "title": "COMPONENTS & SPARE PARTS",
            "columns": [
                {"key": "sn", "label": "S/N"},
                {"key": "item", "label": "Description"},
                {"key": "qty", "label": "Qty"},
                {"key": "unitPrice", "label": "Unit price (TZS)"},
                {"key": "totalPrice", "label": "Total (TZS)"},
            ],
            "rows": COMPONENT_ROWS,
        },
    ]

    payload = {
        "invoiceNumber": INVOICE_NUMBER,
        "documentKind": "invoice",
        "dashboardScope": "main",
        "issueDate": ISSUE_DATE,
        "dueDate": DUE_DATE,
        "currency": "TZS",
        "taxRate": 0,
        "discount": 0,
        "clientName": CLIENT_NAME,
        "clientEmail": "info@tsp.co.tz",
        "clientPhone": "+255 (0)22-2450457",
        "clientAddress": CLIENT_ADDRESS,
        "fromName": "Honic Company Limited",
        "fromEmail": "support@honiccompany.com",
        "fromPhone": "+255 763 818138 / +255 786 957 939",
        "companyWebsite": "www.honiccompanystore.com",
        "companyTagline": "INNOVATIONS AND RESEARCH",
        "signerName": "Authorized Signatory",
        "signerTitle": "Engineering / Repair Team",
        "footerPhone": "+255 786 957 939",
        "footerEmail": "support@honiccompany.com",
        "footerAddress": "Dar es Salaam, Tanzania",
        "thankYouLine": "Thank you for your business.",
        "referenceNumber": REFERENCE,
        "itemsTableTitle": "Cost Breakdown",
        "termsText": (
            f"Ref: Technical Report {REFERENCE} — ANDREX SMART 583 (S/N 81226).\n\n"
            "Diagnostics fee is fixed and non-refundable. Spare parts are imported; lead time applies after approval.\n\n"
            "Work proceeds upon written approval of this invoice and the technical report."
        ),
        # Keep empty flat items so studio uses projectTables for totals/layout
        "items": [],
        "projectTables": {
            "sections": sections,
            "paymentSchedule": [],
            "hidePaymentSchedule": True,
            "paymentGrandTotal": f"{grand_total:g}",
            "note": f"Linked to technical report {REFERENCE}.",
        },
        "paymentMethods": [
            {
                "id": "pm-1",
                "title": "LIPA NAMBA",
                "accountName": "HONIC COMPANY LIMITED",
                "bank": "SELCOM PESA",
                "account": "6123 8368",
            }
        ],
        "invoiceLogo": "",
        "signatureImage": SIGNATURE_PUBLIC_URL,
        "stampImage": STAMP_PUBLIC_URL,
        "totals": {"subtotal": grand_total, "taxAmount": 0, "grandTotal": grand_total},
        "linkedTechnicalReport": REFERENCE,
    }

    now = datetime.now(timezone.utc).isoformat()
    record = {
        "invoice_number": INVOICE_NUMBER,
        "client_name": CLIENT_NAME,
        "issue_date": ISSUE_DATE,
        "due_date": DUE_DATE,
        "currency": "TZS",
        "subtotal": grand_total,
        "tax_amount": 0,
        "grand_total": grand_total,
        "payload": payload,
        "updated_at": now,
    }

    existing = find_existing(base, apikey, INVOICE_NUMBER)
    if existing:
        status, data = supabase_request(
            "PATCH",
            f"{base}/rest/v1/invoices?id=eq.{existing['id']}",
            apikey,
            record,
        )
        action = "updated"
        inv_id = existing["id"]
    else:
        record["created_at"] = now
        record["created_by"] = None
        status, data = supabase_request("POST", f"{base}/rest/v1/invoices", apikey, record)
        action = "inserted"
        inv_id = None

    if status >= 400:
        raise SystemExit(f"Invoice save failed ({status}): {json.dumps(data, ensure_ascii=False)}")

    first = data[0] if isinstance(data, list) and data else {}
    inv_id = first.get("id", inv_id)

    report = find_report(base, apikey, REFERENCE)
    if report:
        rp = dict(report.get("payload") or {})
        rp["closureNote"] = (
            f"Enclosure: Invoice {INVOICE_NUMBER} — Service TZS {service_total:,.0f}; "
            f"Components TZS {parts_total:,.0f}; Grand total TZS {grand_total:,.0f}.\n\n"
            "To proceed with repair we require:\n"
            "1. Formal approval of this report and the recommended repair strategy.\n"
            f"2. Approval of invoice {INVOICE_NUMBER}."
        )
        rp["linkedInvoiceNumber"] = INVOICE_NUMBER
        supabase_request(
            "PATCH",
            f"{base}/rest/v1/invoices?id=eq.{report['id']}",
            apikey,
            {"payload": rp, "updated_at": now},
        )

    print(
        json.dumps(
            {
                action: True,
                "id": inv_id,
                "invoice_number": INVOICE_NUMBER,
                "layout": "two_tables",
                "service_total": service_total,
                "components_total": parts_total,
                "grand_total": grand_total,
                "edit_url": f"/dashboard/invoices?invoiceId={inv_id}&mode=edit",
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
