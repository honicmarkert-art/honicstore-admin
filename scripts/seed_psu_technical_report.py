"""Seed first PSU technical diagnostic report into invoices table."""
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from urllib import error, parse, request

# Import defaults by reading the TS file is awkward — duplicate payload here aligned with lib/technical-report-defaults.ts
REPORT_NUMBER = "TR-2026-0001"
STAMP_PUBLIC_URL = (
    "https://qobobocldfjhdkpjyuuq.supabase.co/storage/v1/object/public/"
    "invoice-assets/invoices/admin/stamp/company-stamp.jpg"
)

SECTIONS = [
    {
        "id": "sec-1",
        "title": "1. Executive Summary",
        "body": (
            "We completed an inspection (ukaguzi) of the machine’s power supply system. "
            "The power system splits electricity into different voltage stages to run the machine. "
            "We found major faults causing the machine to shut down. To restore stable, high-quality operation, "
            "we must replace one dead power module and repair two failed circuits on another board."
        ),
        "status": "",
        "statusTone": "neutral",
    },
    {
        "id": "sec-2a",
        "title": "2. Diagnostic Findings — Stage 1: 5V (7A) External Power Supply",
        "status": "Completely Dead / Unstable",
        "statusTone": "danger",
        "body": (
            "This is a separate power box mounted inside the main unit. We troubleshot the system and got it to turn on, "
            "but it does not work for long. It runs for a few minutes and then goes completely off. It is completely unreliable."
        ),
    },
    {
        "id": "sec-2b",
        "title": "Stage 2: 24V (5A) Main Power Supply",
        "status": "Working Perfectly",
        "statusTone": "ok",
        "body": "Voltage measurements are stable and within normal limits.",
    },
    {
        "id": "sec-2c",
        "title": "Stage 3: 27V Booster & 15V Buck Circuits",
        "status": "Failed (But Repairable)",
        "statusTone": "warn",
        "body": (
            "These are two separate circuits built onto the 24V power board. The 27V Booster and the 15V Buck have both failed. "
            "However, the main circuit board itself is healthy. We can fix this part by replacing the broken individual components with brand-new ones."
        ),
    },
    {
        "id": "sec-3",
        "title": "3. Recommendations & Action Plan",
        "status": "",
        "statusTone": "neutral",
        "body": (
            "Full Replacement of the 5V PSU: We recommend replacing the 5V unit with a brand-new module. "
            "Repairing the old one is not reliable. A new part guarantees long-term machine efficiency and quality performance.\n\n"
            "Component Repair for 27V & 15V Circuits: We recommend repairing these circuits by replacing the bad individual electronic components. "
            "We guarantee this will return this section to normal condition."
        ),
    },
    {
        "id": "sec-4",
        "title": "4. Sourcing & Timeline Challenges",
        "status": "",
        "statusTone": "neutral",
        "body": (
            "The Challenge: Most of the repair components and the new 5V power supply are not available in the country.\n\n"
            "The Solution: We must purchase and import these items from international suppliers abroad.\n\n"
            "Time Impact: Importing the parts will add some extra days of work. We will order everything immediately after you confirm that we should proceed."
        ),
    },
    {
        "id": "sec-5",
        "title": "5. Commercial Attachment",
        "status": "",
        "statusTone": "neutral",
        "body": (
            "A detailed parts list, quantities, and cost estimate are provided in the attached proforma invoice (issued separately). "
            "This report covers technical findings and the recommended repair strategy only; commercial details are in the proforma attachment."
        ),
    },
    {
        "id": "sec-6",
        "title": "6. Next Steps to Proceed",
        "status": "",
        "statusTone": "neutral",
        "body": (
            "The machine cannot run safely in its current state. To begin the repair process, we need:\n\n"
            "1. Formal approval of this report and the repair strategy.\n"
            "2. Approval of the procurement budget to import the parts (see attached proforma invoice)."
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
        "clientName": "Client Management",
        "toName": "Client Management",
        "toAddress": "",
        "clientAddress": "",
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
        "machineName": "",
        "subject": "Power Supply Unit (PSU) Inspection and Repair Plan",
        "attachmentNote": (
            "This technical report is issued together with a separate proforma invoice that lists required parts, "
            "quantities, and costs. Please review the attached proforma for procurement and budget approval."
        ),
        "nextSteps": (
            "The machine cannot run safely in its current state. To begin the repair process, we need:\n\n"
            "1. Formal approval of this report and the repair strategy.\n"
            "2. Approval of the procurement budget (see attached proforma invoice) to import the parts."
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
        "client_name": "Client Management",
        "issue_date": "2026-07-22",
        "due_date": None,
        "currency": "TZS",
        "subtotal": 0,
        "tax_amount": 0,
        "grand_total": 0,
        "created_by": None,
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
                "edit_url": f"/dashboard/technical-reports?invoiceId={first.get('id', rid)}&mode=edit",
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
