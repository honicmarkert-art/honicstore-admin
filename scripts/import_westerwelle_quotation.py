"""Import QUOTE WESTERWELLE.pdf into Honic invoice-studio quotation format."""
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from urllib import error, parse, request

INVOICE_NUMBER = "QTE-2026-WESTERWELLE"
CLIENT_NAME = "Westerwelle Foundation"
CLIENT_ADDRESS = (
    "7th Floor Mega Complex\n"
    "Bondeni Street\n"
    "P.O. Box 16759\n"
    "Arusha-TZ\n"
    "TIN 155-047-941"
)
ISSUE_DATE = "2026-07-20"
DUE_DATE = "2026-08-20"  # valid 30 days
QUOTATION_SCOPE = "3D printers, filament, and transport within Tanzania."
ITEMS_TABLE_TITLE = "3D Printing Equipment Quotation"
STAMP_PUBLIC_URL = (
    "https://qobobocldfjhdkpjyuuq.supabase.co/storage/v1/object/public/"
    "invoice-assets/invoices/admin/stamp/company-stamp.jpg"
)

ITEMS = [
    {"description": "Anycubic Kobra X 3D Printer", "quantity": 1, "unitPrice": 2600000},
    {"description": "Anycubic Kobra 3 Max Combo 3D Printer", "quantity": 1, "unitPrice": 3990000},
    {"description": "3D Printing Filament", "quantity": 6, "unitPrice": 80000},
    {"description": "Transport (In Tanzania)", "quantity": 1, "unitPrice": 100000},
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


def find_existing(base_url: str, apikey: str, invoice_number: str) -> dict | None:
    safe = parse.quote(invoice_number, safe="")
    status, data = supabase_request(
        "GET",
        f"{base_url}/rest/v1/invoices?select=id,invoice_number,payload&invoice_number=eq.{safe}&limit=1",
        apikey,
    )
    if status >= 400 or not isinstance(data, list) or not data:
        return None
    return data[0]


def build_record(invoice_number: str) -> dict:
    items = [
        {
            "id": f"ww-{i}",
            "description": it["description"],
            "quantity": it["quantity"],
            "unitPrice": it["unitPrice"],
        }
        for i, it in enumerate(ITEMS, start=1)
    ]
    grand_total = sum(it["quantity"] * it["unitPrice"] for it in ITEMS)
    payload = {
        "invoiceNumber": invoice_number,
        "documentKind": "quotation",
        "quotationCategory": "equipment",
        "dashboardScope": "main",
        "issueDate": ISSUE_DATE,
        "dueDate": DUE_DATE,
        "currency": "TZS",
        "taxRate": 0,
        "discount": 0,
        "clientName": CLIENT_NAME,
        "clientEmail": "",
        "clientPhone": "",
        "clientAddress": CLIENT_ADDRESS,
        "fromName": "Honic Company Limited",
        "fromEmail": "sales@honiccompanystore.com",
        "fromPhone": "+255 763 818138 / +255 786 957 939",
        "companyWebsite": "www.honiccompanystore.com",
        "companyTagline": "ONLINE RETAIL",
        "signerName": "Authorized Signatory",
        "signerTitle": "Administrator",
        "footerPhone": "+255 786 957 939",
        "footerEmail": "support@honiccompany.com",
        "footerAddress": "Dar es Salaam, Tanzania",
        "thankYouLine": "Thank you for considering our proposal.",
        "termsText": (
            "This document is a quotation only — not a tax invoice. No payment is due until a formal invoice is issued upon acceptance.\n\n"
            "This quotation is valid until the date shown above. Prices are estimates and subject to availability. "
            "Written acceptance is required before supply begins.\n\n"
            "VAT is included in the quoted prices."
        ),
        "quotationScope": QUOTATION_SCOPE,
        "itemsTableTitle": ITEMS_TABLE_TITLE,
        "referenceNumber": "QT-01",
        "items": items,
        "paymentMethods": [],
        "totals": {"subtotal": grand_total, "taxAmount": 0, "grandTotal": grand_total},
        "stampImage": STAMP_PUBLIC_URL,
        "importSource": "QUOTE WESTERWELLE.pdf",
    }
    return {
        "invoice_number": invoice_number,
        "client_name": CLIENT_NAME,
        "issue_date": ISSUE_DATE,
        "due_date": DUE_DATE,
        "currency": "TZS",
        "subtotal": grand_total,
        "tax_amount": 0,
        "grand_total": grand_total,
        "created_by": None,
        "payload": payload,
    }


def main():
    repo_root = Path(__file__).resolve().parents[1]
    load_env(repo_root / ".env.local")
    supabase_url = os.getenv("NEXT_PUBLIC_SUPABASE_URL", "").rstrip("/")
    apikey = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
    if not supabase_url or not apikey:
        raise SystemExit("Missing Supabase env vars in honicstore-admin/.env.local")

    record = build_record(INVOICE_NUMBER)
    now = datetime.now(timezone.utc).isoformat()
    record["updated_at"] = now

    existing = find_existing(supabase_url, apikey, INVOICE_NUMBER)
    if existing:
        status, data = supabase_request(
            "PATCH",
            f"{supabase_url}/rest/v1/invoices?id=eq.{existing['id']}",
            apikey,
            {k: v for k, v in record.items() if k != "created_at"},
        )
        action = "updated"
        record_id = existing["id"]
    else:
        record["created_at"] = now
        status, data = supabase_request("POST", f"{supabase_url}/rest/v1/invoices", apikey, record)
        action = "inserted"
        record_id = None

    if status >= 400:
        raise SystemExit(f"Save failed ({status}): {json.dumps(data, ensure_ascii=False)}")

    first = data[0] if isinstance(data, list) and data else {}
    print(
        json.dumps(
            {
                action: True,
                "id": first.get("id", record_id),
                "invoice_number": first.get("invoice_number", INVOICE_NUMBER),
                "client_name": CLIENT_NAME,
                "item_count": len(ITEMS),
                "grand_total": first.get("grand_total", record["grand_total"]),
                "issue_date": ISSUE_DATE,
                "due_date": DUE_DATE,
                "edit_url": f"/dashboard/invoices?invoiceId={first.get('id', record_id)}&mode=edit",
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
