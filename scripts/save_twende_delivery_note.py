"""Save Twende Tanzania delivery note (from HC-PI-2026-017) directly to Supabase invoices table."""
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from urllib import error, parse, request

# Reuse preset data shape — keep in sync with lib/delivery-note-presets.ts
TWENDE_ITEMS = [
    {"description": "Digital Oscilloscope 2-channel 100MHz (1014D)", "quantity": 2},
    {"description": "Signal Generator Dual channel DDS (FY600-20MHz)", "quantity": 1},
    {"description": "IoT Starter Kits — ESP32 kit, 30 models", "quantity": 2},
    {"description": "Robotic Starter Kit — Arduino UNO, 4WD chassis, 3WD chassis, Battery 3S, 24 models", "quantity": 3},
    {"description": "Servo Motor SG90", "quantity": 5},
    {"description": "Servo Motor MG90S", "quantity": 5},
    {"description": "DC Gear Motor 5V BO Gear Motor", "quantity": 10},
    {"description": "Sensor Kit — 37 sensors", "quantity": 5},
    {"description": "Arduino Uno Board — Arduino Uno R4 Minima", "quantity": 5},
    {"description": "Arduino Uno Board — Arduino Uno R4 Wi-Fi", "quantity": 5},
    {"description": "Perfboards Assorted Kit (30 pcs)", "quantity": 1},
    {"description": "Breadboard MB-102 (830 holes)", "quantity": 15},
    {"description": "Jumpers & Connectors — JST XH 20cm male cable + female connector", "quantity": 200},
    {"description": "Soldering Station 952D 700W", "quantity": 3},
    {"description": "Digital Multimeter UNI-T UT61B+ Auto", "quantity": 5},
    {"description": "Bench Power Supply SPS 3010M 30V / 5A", "quantity": 3},
    {"description": "Resistor Assorted Kit — 41 types, 20 each (820 pcs)", "quantity": 1},
    {"description": "Transistor Assorted Kit — 24 types, 35 each (840 pcs)", "quantity": 1},
    {"description": "Diode Assorted Kit — 10 types, 20 each (200 pcs)", "quantity": 1},
    {"description": "PCB Board — single sided FR4", "quantity": 2},
    {"description": "Stepper Motor NEMA 17 + Driver A4988", "quantity": 5},
    {"description": "Stepper Motor 28BYJ-48 + Driver ULN2003", "quantity": 5},
    {"description": "ATmega IC ATmega328PU + 28-pin socket", "quantity": 10},
    {"description": "Crystal Oscillator Assorted Kit — 10 types, 20 each (200 pcs)", "quantity": 1},
    {"description": "Ceramic Capacitor Assorted Kit — 10 types, 50 each (500 pcs)", "quantity": 1},
    {"description": "Electrolytic Capacitor Assorted Kit — 24 types, 20 each (500 pcs)", "quantity": 1},
    {"description": "Regulator Assorted Kit", "quantity": 1},
    {"description": "Jumper Wires Bundle — M-M, F-M, F-F", "quantity": 15},
    {"description": "LED Assorted Kit — 5 types, 20 each (100 pcs)", "quantity": 2},
    {"description": "Switch DPST 2-Pin", "quantity": 10},
    {"description": "Push Button Assorted Kit — 10 types, 20 each (200 pcs)", "quantity": 1},
    {"description": "Relay Module SRD-05DC-SL-C", "quantity": 5},
]

TERMS_DEFAULT = (
    "This delivery note confirms the items and quantities shipped. It is not an invoice and does not request payment.\n\n"
    "Please check goods against your order. Note any missing, damaged, or incorrect items on the proof of receipt section and sign to confirm delivery."
)


def load_env(env_path: Path) -> None:
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


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


def ensure_unique_invoice_number(base_url: str, apikey: str, invoice_number: str) -> str:
    safe = parse.quote(invoice_number, safe="")
    status, data = supabase_request(
        "GET", f"{base_url}/rest/v1/invoices?select=id&invoice_number=eq.{safe}&limit=1", apikey
    )
    if status >= 400:
        return invoice_number
    if isinstance(data, list) and data:
        suffix = datetime.now().strftime("%H%M%S")
        return f"{invoice_number}-{suffix}"
    return invoice_number


def build_record(today: str) -> dict:
    invoice_number = "DN-2026-HC-PI-2026-017"
    client_name = "Twende Tanzania"
    items = [
        {"id": f"dn-{i}", "description": it["description"], "quantity": it["quantity"], "unitPrice": 0}
        for i, it in enumerate(TWENDE_ITEMS, start=1)
    ]
    payload = {
        "invoiceNumber": invoice_number,
        "documentKind": "delivery_note",
        "dashboardScope": "main",
        "issueDate": today,
        "dueDate": today,
        "currency": "TZS",
        "taxRate": 0,
        "discount": 0,
        "clientName": client_name,
        "clientEmail": "",
        "clientPhone": "",
        "clientAddress": "Arusha, Tanzania",
        "fromName": "Honic Company Limited",
        "fromEmail": "sales@honiccompanystore.com",
        "fromPhone": "+255 763 818138 / 627 377461",
        "companyWebsite": "honiccompanystore.com",
        "companyTagline": "ONLINE RETAIL",
        "signerName": "Authorized Signatory",
        "signerTitle": "Administrator",
        "footerPhone": "+255 786 957 939",
        "footerEmail": "support@honiccompany.com",
        "footerAddress": "Dar es Salaam, Tanzania",
        "thankYouLine": "Please verify all items listed below upon receipt.",
        "termsText": TERMS_DEFAULT,
        "quotationScope": "",
        "referenceNumber": "HC-PI-2026-017",
        "backorderedNote": "",
        "items": items,
        "paymentMethods": [],
        "totals": {"subtotal": 0, "taxAmount": 0, "grandTotal": 0},
    }
    return {
        "invoice_number": invoice_number,
        "client_name": client_name,
        "issue_date": today,
        "due_date": today,
        "currency": "TZS",
        "subtotal": 0,
        "tax_amount": 0,
        "grand_total": 0,
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

    today = datetime.now().strftime("%Y-%m-%d")
    record = build_record(today)
    record["invoice_number"] = ensure_unique_invoice_number(supabase_url, apikey, record["invoice_number"])
    record["payload"]["invoiceNumber"] = record["invoice_number"]

    now = datetime.now(timezone.utc).isoformat()
    record["created_at"] = now
    record["updated_at"] = now

    status, data = supabase_request("POST", f"{supabase_url}/rest/v1/invoices", apikey, record)
    if status >= 400:
        raise SystemExit(f"Insert failed ({status}): {json.dumps(data, ensure_ascii=False)}")

    first = data[0] if isinstance(data, list) and data else {}
    print(
        json.dumps(
            {
                "inserted": True,
                "id": first.get("id"),
                "invoice_number": first.get("invoice_number"),
                "client_name": first.get("client_name"),
                "issue_date": first.get("issue_date"),
                "item_count": len(TWENDE_ITEMS),
                "edit_url": f"/dashboard/delivery-notes?invoiceId={first.get('id')}&mode=edit",
                "list_url": "/dashboard/delivery-notes/list",
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
