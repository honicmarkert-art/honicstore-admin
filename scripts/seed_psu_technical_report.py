"""Update TR-2026-0001 to professional TSP X-ray PSU report layout/content."""
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from urllib import error, parse, request

REPORT_NUMBER = "TR-2026-0001"
STAMP_PUBLIC_URL = (
    "https://qobobocldfjhdkpjyuuq.supabase.co/storage/v1/object/public/"
    "invoice-assets/invoices/admin/stamp/company-stamp.jpg"
)

SECTIONS = [
    {
        "id": "sec-1",
        "title": "1. Executive Summary",
        "status": "",
        "body": (
            "We completed an inspection (ukaguzi) of the X-ray inspection system’s power supply. "
            "The power system splits electricity into different voltage stages to run the machine. "
            "We found major faults that prevent reliable startup and sustained operation. "
            "To restore stable, high-quality operation, one dead power module must be replaced and two failed circuits on another board must be repaired."
        ),
    },
    {
        "id": "sec-2",
        "title": "2. Problem Description",
        "status": "",
        "body": (
            "The X-ray inspection system fails to start. The ANDREX SMART display and XRS Controller monitor remain blank during startup."
        ),
    },
    {
        "id": "sec-3a",
        "title": "3. Diagnostic Findings",
        "status": "",
        "body": "Findings are organised by power stage of the XRS power supply system.",
    },
    {
        "id": "sec-3b",
        "title": "3.1 Stage 1 — 5V (7A) External Power Supply",
        "status": "Status: Completely dead / unstable",
        "body": (
            "This is a separate power box mounted inside the main unit. Troubleshooting restored temporary power, "
            "but the supply does not remain operational. It runs for only a few minutes, then shuts down completely. "
            "The module is unreliable and not fit for continued service."
        ),
    },
    {
        "id": "sec-3c",
        "title": "3.2 Stage 2 — 24V (5A) Main Power Supply",
        "status": "Status: Working within specification",
        "body": "Voltage measurements are stable and within normal limits.",
    },
    {
        "id": "sec-3d",
        "title": "3.3 Stage 3 — 27V Booster & 15V Buck Circuits",
        "status": "Status: Failed — repairable at component level",
        "body": (
            "These two circuits are built onto the 24V power board. Both the 27V booster and the 15V buck have failed. "
            "The main board substrate remains serviceable; failed discrete components can be replaced with new parts to restore this section."
        ),
    },
    {
        "id": "sec-4",
        "title": "4. Recommendations & Action Plan",
        "status": "",
        "body": (
            "5V PSU: Replace the 5V external module with a new unit. Repair of the failed module is not recommended for long-term reliability.\n\n"
            "27V / 15V circuits: Repair by replacing the failed electronic components on the board. "
            "This returns that section to normal operating condition when completed and tested."
        ),
    },
    {
        "id": "sec-5",
        "title": "5. Sourcing & Timeline",
        "status": "",
        "body": (
            "Most required repair components and the replacement 5V supply are not available locally and must be imported from international suppliers.\n\n"
            "Import lead time will add working days after approval. Ordering will start immediately upon confirmation to proceed."
        ),
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


def main():
    repo_root = Path(__file__).resolve().parents[1]
    load_env(repo_root / ".env.local")
    supabase_url = os.getenv("NEXT_PUBLIC_SUPABASE_URL", "").rstrip("/")
    apikey = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
    if not supabase_url or not apikey:
        raise SystemExit("Missing Supabase env vars")

    payload = {
        "documentKind": "technical_report",
        "dashboardScope": "main",
        "invoiceNumber": REPORT_NUMBER,
        "reportNumber": REPORT_NUMBER,
        "reportTitle": "TECHNICAL DIAGNOSTIC & REPAIR REPORT",
        "documentRevision": "Rev. 00",
        "confidentiality": "Confidential — issued for Tanzania Steel Pipes Limited only",
        "clientName": "Tanzania Steel Pipes Limited",
        "toName": "Tanzania Steel Pipes Limited",
        "toAddress": (
            "Plot 4, Ubungo Industrial Estate\n"
            "Morogoro Road\n"
            "P.O. Box 5476\n"
            "Dar es Salaam, Tanzania\n"
            "Tel: +255 (0)22-2450457\n"
            "Email: info@tsp.co.tz"
        ),
        "clientAddress": (
            "Plot 4, Ubungo Industrial Estate\n"
            "Morogoro Road\n"
            "P.O. Box 5476\n"
            "Dar es Salaam, Tanzania\n"
            "Tel: +255 (0)22-2450457\n"
            "Email: info@tsp.co.tz"
        ),
        "fromName": "Honic Company Limited",
        "fromEmail": "support@honiccompany.com",
        "fromPhone": "+255 763 818138 / +255 786 957 939",
        "companyWebsite": "www.honiccompanystore.com",
        "companyTagline": "INNOVATIONS AND RESEARCH",
        "footerPhone": "+255 786 957 939",
        "footerEmail": "support@honiccompany.com",
        "footerAddress": "Dar es Salaam, Tanzania",
        "issueDate": "2026-07-22",
        "reportDate": "2026-07-22",
        "machineName": "YXLON ANDREX SMART 583 (XRS)",
        "serialNumber": "81226",
        "application": "Non-Medical / Non-Destructive Testing (NDT) — spiral steel pipes",
        "subject": "XRS Power Supply Failure – YXLON ANDREX SMART 583",
        "closureNote": (
            "Enclosure: A separate proforma invoice is attached with required parts, quantities, and costs.\n\n"
            "To proceed with repair we require:\n"
            "1. Formal approval of this report and the recommended repair strategy.\n"
            "2. Approval of the procurement budget on the attached proforma invoice."
        ),
        "preparedByName": "Authorized Signatory",
        "preparedByTitle": "Engineering / Repair Team",
        "signerName": "Authorized Signatory",
        "signerTitle": "Engineering / Repair Team",
        "sections": SECTIONS,
        "stampImage": STAMP_PUBLIC_URL,
        "invoiceLogo": "",
        "signatureImage": "",
        "currency": "TZS",
        "totals": {"subtotal": 0, "taxAmount": 0, "grandTotal": 0},
    }

    now = datetime.now(timezone.utc).isoformat()
    record = {
        "invoice_number": REPORT_NUMBER,
        "client_name": "Tanzania Steel Pipes Limited",
        "issue_date": "2026-07-22",
        "due_date": None,
        "currency": "TZS",
        "subtotal": 0,
        "tax_amount": 0,
        "grand_total": 0,
        "payload": payload,
        "updated_at": now,
    }

    existing = find_existing(supabase_url, apikey, REPORT_NUMBER)
    if existing:
        status, data = supabase_request(
            "PATCH",
            f"{supabase_url}/rest/v1/invoices?id=eq.{existing['id']}",
            apikey,
            record,
        )
        action = "updated"
        rid = existing["id"]
    else:
        record["created_at"] = now
        record["created_by"] = None
        status, data = supabase_request("POST", f"{supabase_url}/rest/v1/invoices", apikey, record)
        action = "inserted"
        rid = None

    if status >= 400:
        raise SystemExit(f"Save failed ({status}): {json.dumps(data, ensure_ascii=False)}")

    first = data[0] if isinstance(data, list) and data else {}
    print(
        json.dumps(
            {
                action: True,
                "id": first.get("id", rid),
                "report_number": REPORT_NUMBER,
                "client": "Tanzania Steel Pipes Limited",
                "machine": "YXLON ANDREX SMART 583 (XRS)",
                "edit_url": f"/dashboard/technical-reports?invoiceId={first.get('id', rid)}&mode=edit",
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
