"""TSP X-ray repair invoice — Components first, then Service; comma prices; dual-use terms."""
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
    "Dar es Salaam, Tanzania"
)
LOGO_PUBLIC_URL = (
    "https://qobobocldfjhdkpjyuuq.supabase.co/storage/v1/object/public/"
    "invoice-assets/invoices/admin/logo/company-logo.jpg"
)
STAMP_PUBLIC_URL = (
    "https://qobobocldfjhdkpjyuuq.supabase.co/storage/v1/object/public/"
    "invoice-assets/invoices/admin/stamp/company-stamp.jpg"
)
SIGNATURE_PUBLIC_URL = (
    "https://qobobocldfjhdkpjyuuq.supabase.co/storage/v1/object/public/"
    "invoice-assets/invoices/admin/signature/prepared-by-signature-white-v2.png"
)
COMPANY_ADDRESS = (
    "42 Bibi Titi Road\n"
    "DIT CEITT Building, 3rd Floor\n"
    "P.O. Box 2958\n"
    "Dar es Salaam, Tanzania"
)
COMPANY_ADDRESS_FOOTER = (
    "42 Bibi Titi Road, DIT CEITT Building, 3rd Floor, P.O. Box 2958, Dar es Salaam, Tanzania"
)


def money(n: float | int) -> str:
    """Match invoice studio money() presentation: 1,251,400.00"""
    return f"{float(n):,.2f}"


# Option 2 — Local troubleshooting
# Target after discount: TZS 4,234,500
DISCOUNT = 100000
TARGET_AFTER_DISCOUNT = 4234500
TARGET_SUBTOTAL = TARGET_AFTER_DISCOUNT + DISCOUNT  # 4,334,500

COMPONENT_ROWS = [
    {
        "sn": "1",
        "item": "Buck and Boost converter — Boost XL6009",
        "qty": "1",
        "unitPrice": money(55000),
        "totalPrice": money(55000),
    },
    {
        "sn": "2",
        "item": "Buck converter components",
        "qty": "5",
        "unitPrice": money(12900),
        "totalPrice": money(64500),
    },
    {
        "sn": "3",
        "item": "Boost converter components",
        "qty": "5",
        "unitPrice": money(12900),
        "totalPrice": money(64500),
    },
    {
        "sn": "4",
        "item": "Electrolytic capacitor kit — rail filter / decoupling",
        "qty": "1",
        "unitPrice": money(120000),
        "totalPrice": money(120000),
    },
    {
        "sn": "5",
        "item": "Ceramic / MLCC filter capacitor kit",
        "qty": "1",
        "unitPrice": money(55000),
        "totalPrice": money(55000),
    },
    {
        "sn": "6",
        "item": "Fast-blow fuse kit (5V / 24V / 27V rails)",
        "qty": "1",
        "unitPrice": money(35000),
        "totalPrice": money(35000),
    },
    {
        "sn": "7",
        "item": "MOSFET / switching devices (booster stage)",
        "qty": "2",
        "unitPrice": money(55000),
        "totalPrice": money(110000),
    },
    {
        "sn": "8",
        "item": "Thermal pads & insulating kit",
        "qty": "1",
        "unitPrice": money(45000),
        "totalPrice": money(45000),
    },
    {
        "sn": "9",
        "item": "Wire terminals & connector kit",
        "qty": "1",
        "unitPrice": money(65000),
        "totalPrice": money(65000),
    },
    {
        "sn": "10",
        "item": "Flux / solder consumables for board-level repair",
        "qty": "1",
        "unitPrice": money(48000),
        "totalPrice": money(48000),
    },
    {
        "sn": "11",
        "item": "Test leads / jumper kit for rail probing",
        "qty": "1",
        "unitPrice": money(42000),
        "totalPrice": money(42000),
    },
]

SERVICE_ROWS = [
    {
        "sn": "1",
        "item": "Technical diagnostics & inspection (Ukaguzi) — fixed, non-refundable",
        "qty": "1",
        "amount": money(750000),
    },
    {
        "sn": "2",
        "item": "Local advanced troubleshooting — multi-rail isolation, load & startup tests",
        "qty": "1",
        "amount": money(1200000),
    },
    {
        "sn": "3",
        "item": "Component-level repair labour (local) — 27V/15V and related stages",
        "qty": "1",
        "amount": money(1100000),
    },
    {
        "sn": "4",
        "item": "System testing, verification & return-to-service checks",
        "qty": "1",
        "amount": money(400000),
    },
    {
        "sn": "5",
        "item": "6-month warranty — follow-up visit & inspection cover",
        "qty": "1",
        "amount": money(180500),
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


def parse_money(s: str) -> float:
    return float(str(s).replace(",", ""))


def main():
    repo_root = Path(__file__).resolve().parents[1]
    load_env(repo_root / ".env.local")
    base = os.getenv("NEXT_PUBLIC_SUPABASE_URL", "").rstrip("/")
    apikey = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
    if not base or not apikey:
        raise SystemExit("Missing Supabase env vars")

    parts_total = sum(parse_money(r["totalPrice"]) for r in COMPONENT_ROWS)
    service_total = sum(parse_money(r["amount"]) * parse_money(r["qty"]) for r in SERVICE_ROWS)
    subtotal = parts_total + service_total
    if abs(subtotal - TARGET_SUBTOTAL) > 0.5:
        raise SystemExit(f"Subtotal must be {TARGET_SUBTOTAL:,.0f} (got {subtotal:,.0f})")
    grand_total = max(0, subtotal - DISCOUNT)
    if abs(grand_total - TARGET_AFTER_DISCOUNT) > 0.5:
        raise SystemExit(f"Grand total must be {TARGET_AFTER_DISCOUNT:,.0f} (got {grand_total:,.0f})")

    # Components first, then service — professional repair invoice order
    sections = [
        {
            "title": "1. COMPONENTS & MATERIALS (LOCAL TROUBLESHOOTING)",
            "columns": [
                {"key": "sn", "label": "S/N", "align": "center"},
                {"key": "item", "label": "Description"},
                {"key": "qty", "label": "Qty", "align": "right"},
                {"key": "unitPrice", "label": "Unit price", "align": "right"},
                {"key": "totalPrice", "label": "Total", "align": "right"},
            ],
            "rows": COMPONENT_ROWS,
        },
        {
            "title": "2. SERVICE CHARGES (OPTION 2)",
            "columns": [
                {"key": "sn", "label": "S/N", "align": "center"},
                {"key": "item", "label": "Description"},
                {"key": "qty", "label": "Qty", "align": "right"},
                {"key": "amount", "label": "Amount", "align": "right"},
            ],
            "rows": SERVICE_ROWS,
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
        "discount": DISCOUNT,
        "clientName": CLIENT_NAME,
        "clientEmail": "info@tsp.co.tz",
        "clientPhone": "+255 (0)22-2450457",
        "clientAddress": CLIENT_ADDRESS,
        "fromName": "Honic Company Limited",
        "fromEmail": "support@honiccompany.com",
        "fromPhone": "+255 763 818138 / +255 786 957 939",
        "fromAddress": COMPANY_ADDRESS,
        "companyWebsite": "www.honiccompanystore.com",
        "companyTagline": "INNOVATIONS AND RESEARCH",
        "signerName": "Authorized Signatory",
        "signerTitle": "Engineering / Repair Team",
        "footerPhone": "+255 786 957 939",
        "footerEmail": "support@honiccompany.com",
        "footerAddress": COMPANY_ADDRESS_FOOTER,
        "thankYouLine": "Thank you for your business.",
        "referenceNumber": REFERENCE,
        "itemsTableTitle": "Cost Breakdown — Option 2 Local Troubleshooting (ANDREX SMART 583)",
        "termsText": (
            f"Ref: Technical Report {REFERENCE} (ANDREX SMART 583, S/N 81226).\n\n"
            "SCOPE: This invoice covers **Option 2 — Local troubleshooting** as recommended in the technical report.\n\n"
            "Includes local component-level repair materials, troubleshooting labour, testing, and a "
            "**6-month warranty for follow-up visit and inspection**.\n\n"
            "Full imported 5V PSU module replacement (Option 1) is NOT included on this invoice. "
            "If Option 1 is later selected, a revised invoice will be issued.\n\n"
            "DOCUMENT USE: This document may be used as a Proforma Invoice for quotation / approval "
            "and as a Tax Invoice for billing and payment.\n\n"
            "All amounts are in Tanzania Shillings (TZS). Diagnostics fee is fixed and non-refundable.\n\n"
            "Work proceeds upon written approval of this invoice and selection of Option 2."
        ),
        "items": [],
        "projectTables": {
            "sections": sections,
            "paymentSchedule": [],
            "hidePaymentSchedule": True,
            "paymentGrandTotal": money(grand_total),
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
        "invoiceLogo": LOGO_PUBLIC_URL,
        "signatureImage": SIGNATURE_PUBLIC_URL,
        "stampImage": STAMP_PUBLIC_URL,
        "totals": {"subtotal": subtotal, "taxAmount": 0, "grandTotal": grand_total},
        "linkedTechnicalReport": REFERENCE,
    }

    now = datetime.now(timezone.utc).isoformat()
    record = {
        "invoice_number": INVOICE_NUMBER,
        "client_name": CLIENT_NAME,
        "issue_date": ISSUE_DATE,
        "due_date": DUE_DATE,
        "currency": "TZS",
        "subtotal": subtotal,
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
            f"Enclosure: Invoice {INVOICE_NUMBER} — **Option 2 Local troubleshooting** "
            f"(Subtotal TZS {subtotal:,.0f}; Discount TZS {DISCOUNT:,.0f}; "
            f"Grand total TZS {grand_total:,.0f}).\n\n"
            "Please confirm in writing which recommendation you select:\n"
            "1. Full PSU part replacement — payment before kazi kuisha (separate Option 1 invoice).\n"
            "2. Local troubleshooting — 6-month warranty for visit and inspection (this invoice).\n\n"
            "Work proceeds only after that confirmation."
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
                "order": ["components", "service"],
                "components_total": money(parts_total),
                "service_total": money(service_total),
                "subtotal": money(subtotal),
                "discount": money(DISCOUNT),
                "grand_total": money(grand_total),
                "edit_url": f"/dashboard/invoices?invoiceId={inv_id}&mode=edit",
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
