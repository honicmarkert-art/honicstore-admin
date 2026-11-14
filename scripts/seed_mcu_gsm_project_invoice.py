"""Seed project invoice: microcontroller / GSM kit BOM + 200,000 service charge."""
import json
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib import error, parse, request

INVOICE_NUMBER = "INV-2026-MCU-GSM-KIT"
ISSUE_DATE = datetime.now(timezone.utc).date().isoformat()
DUE_DATE = (datetime.now(timezone.utc).date() + timedelta(days=30)).isoformat()
CLIENT_NAME = "Christina and Carolina"
CLIENT_PHONE = "+255 699 262 994"
CLIENT_ADDRESS = "Dar es Salaam, Tanzania"

# Draft retail unit prices (TZS) — edit in Invoice Studio if needed
# Service charge is fixed at 200,000 as requested
SERVICE_CHARGE = 200_000

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
    "42 Bibi Titi Road, DIT CEITT Building, 3rd Floor, "
    "P.O. Box 2958, Dar es Salaam, Tanzania"
)


def money(n: float | int) -> str:
    return f"{float(n):,.2f}"


def parse_money(s: str) -> float:
    return float(str(s).replace(",", ""))


# Electronics components (description, qty, unit_price_tzs)
# Arduino Uno replaces bare ATmega328P; Power Adapter replaces 9V battery
COMPONENT_BOM = [
    ("ARDUINO UNO", 1, 25_000),
    ("SIM900D GSM Module", 1, 50_000),
    ("Magnetic Reed Switch Sensor", 1, 6_000),
    ("5V Electrical Relay Module", 1, 8_500),
    ("BC547 NPN Transistor", 1, 500),
    ("16×2 Character LCD Screen", 1, 15_000),
    ("PCF8574 I²C LCD Expander", 1, 5_500),
    ("Red System Indicator LED", 1, 500),
    ("BUCK CONVERTER", 1, 10_000),
    ("POWER ADAPTER", 1, 12_000),
    ("1 kΩ Potentiometer", 1, 2_000),
    ("10 kΩ Resistor", 2, 200),
    ("4.7 kΩ Resistor", 2, 200),
    ("220 Ω Resistor", 1, 200),
    ("0.33 µF Capacitor", 1, 500),
    ("100 nF Capacitor", 1, 300),
    ("0.01 nF Capacitor", 1, 300),
    ("22 pF Capacitor", 2, 300),
    ("Assorted Jumper Wire Pack", 1, 5_000),
    ("High-Voltage Electrical Cables", 1, 15_000),
    ("1N4007 Flyback Protection Diode", 1, 300),
    ("Circuit Optocoupler Isolation IC", 1, 3_500),
]

# Prototype section — same pattern as other HCIR project invoices
# 3D casing row flagged red like other invoices; acrylic priced as given
PROTOTYPE_BOM = [
    ("3D CIRCUIT CASING", 1, 0, True),
    ("ACRYLIC 1.25 SQ FT", 1, 45_000, False),
    ("Prototyping Full-Size Breadboard", 1, 12_000, False),
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


def main():
    repo_root = Path(__file__).resolve().parents[1]
    load_env(repo_root / ".env.local")
    base = os.getenv("NEXT_PUBLIC_SUPABASE_URL", "").rstrip("/")
    apikey = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
    if not base or not apikey:
        raise SystemExit("Missing Supabase env vars")

    component_rows = []
    for i, (item, qty, unit) in enumerate(COMPONENT_BOM, start=1):
        component_rows.append(
            {
                "sn": str(i),
                "item": item,
                "qty": str(qty),
                "unitPrice": money(unit),
                "totalPrice": money(qty * unit),
            }
        )

    prototype_rows = []
    for i, (item, qty, unit, red) in enumerate(PROTOTYPE_BOM, start=1):
        row = {
            "sn": str(i),
            "item": item,
            "qty": str(qty),
            "unitPrice": money(unit) if unit else "0",
            "totalPrice": money(qty * unit) if unit else "",
        }
        if red:
            row["__prototypeRowRed"] = "1"
        prototype_rows.append(row)

    service_rows = [
        {
            "sn": "1",
            "item": "SERVICE",
            "qty": "1",
            "amount": money(SERVICE_CHARGE),
            "unitPrice": money(SERVICE_CHARGE),
        }
    ]

    parts_total = sum(parse_money(r["totalPrice"]) for r in component_rows)
    prototype_total = sum(parse_money(r["totalPrice"] or "0") for r in prototype_rows)
    service_total = SERVICE_CHARGE
    subtotal = parts_total + prototype_total + service_total
    grand_total = subtotal

    sections = [
        {
            "title": "1. Electrical and Electronics Components",
            "columns": [
                {"key": "sn", "label": "S/N", "align": "center"},
                {"key": "item", "label": "Description"},
                {"key": "qty", "label": "Qty", "align": "right"},
                {"key": "unitPrice", "label": "Unit price", "align": "right"},
                {"key": "totalPrice", "label": "Total", "align": "right"},
            ],
            "rows": component_rows,
        },
        {
            "title": "2. Prototype Items",
            "columns": [
                {"key": "sn", "label": "S/N", "align": "center"},
                {"key": "item", "label": "Description"},
                {"key": "qty", "label": "Qty", "align": "right"},
                {"key": "unitPrice", "label": "Unit price", "align": "right"},
                {"key": "totalPrice", "label": "Total", "align": "right"},
            ],
            "rows": prototype_rows,
        },
        {
            "title": "3. Service Cost",
            "columns": [
                {"key": "sn", "label": "S/N", "align": "center"},
                {"key": "item", "label": "Description"},
                {"key": "qty", "label": "Qty", "align": "right"},
                {"key": "amount", "label": "Amount", "align": "right"},
            ],
            "rows": service_rows,
        },
    ]

    payload = {
        "invoiceNumber": INVOICE_NUMBER,
        "documentKind": "invoice",
        "dashboardScope": "project",
        "issueDate": ISSUE_DATE,
        "dueDate": DUE_DATE,
        "currency": "TZS",
        "taxRate": 0,
        "discount": 0,
        "clientName": CLIENT_NAME,
        "clientEmail": "",
        "clientPhone": CLIENT_PHONE,
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
        "referenceNumber": "",
        "itemsTableTitle": "Cost Breakdown — Arduino Uno / GSM Project Kit",
        "termsText": (
            "SCOPE: Supply of listed electronic components, prototype items "
            "(3D circuit casing, acrylic, breadboard), and project service "
            "(assembly / wiring / testing / configuration) for an Arduino Uno–GSM based system.\n\n"
            "DOCUMENT USE: This document may be used as a Proforma Invoice for quotation / approval "
            "and as a Tax Invoice for billing and payment.\n\n"
            "All amounts are in Tanzania Shillings (TZS).\n\n"
            "Project service charge is fixed at TZS 200,000.00 as agreed.\n\n"
            "**1.** The above costs do not include expenses related to project documentation, "
            "including circuit simulation, block diagram development, or data analysis. "
            "Only component specifications are provided.\n\n"
            "**2.** The final cost may vary depending on design changes or additional requirements, "
            "which may result in an increase or decrease in price.\n\n"
            "**3.** This document can be used as proforma invoice or a tax invoice.\n\n"
            "**4.** The circuit casing highlighted in red indicates that its cost is not yet known. "
            "The cost will only be determined after the circuit casing has been drawn; "
            "once the price is confirmed, you will be notified."
        ),
        "items": [],
        "projectTables": {
            "sections": sections,
            "paymentSchedule": [],
            "hidePaymentSchedule": True,
            "paymentGrandTotal": money(grand_total),
            "note": "Components + prototype items + service charge.",
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
    print(
        json.dumps(
            {
                action: True,
                "id": inv_id,
                "invoice_number": INVOICE_NUMBER,
                "components_total": money(parts_total),
                "prototype_total": money(prototype_total),
                "service_charge": money(service_total),
                "grand_total": money(grand_total),
                "edit_url": f"/dashboard/invoices?invoiceId={inv_id}&mode=edit",
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
