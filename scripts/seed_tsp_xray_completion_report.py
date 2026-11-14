"""Seed TR-2026-0002 — TSP X-ray PSU Option 2 job completion report."""
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from urllib import error, parse, request

REPORT_NUMBER = "TR-2026-0002"
PRIOR_REPORT = "TR-2026-0001"
INVOICE_NUMBER = "INV-2026-TSP-XRAY-PSU"
REPORT_DATE = "2026-07-24"

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

CLIENT_ADDRESS = (
    "Plot 4, Ubungo Industrial Estate\n"
    "Morogoro Road\n"
    "P.O. Box 5476\n"
    "Dar es Salaam, Tanzania\n"
    "Tel: +255 (0)22-2450457\n"
    "Email: info@tsp.co.tz"
)

COMPANY_ADDRESS_FOOTER = (
    "42 Bibi Titi Road, DIT CEITT Building, 3rd Floor, "
    "P.O. Box 2958, Dar es Salaam, Tanzania"
)

PROBLEM_DESCRIPTION = (
    "Original fault (ref. {prior}): X-ray inspection system failed to start; "
    "ANDREX SMART display and XRS Controller monitor remained blank during startup. "
    "This report confirms completion of Option 2 — local troubleshooting and repair."
).format(prior=PRIOR_REPORT)

SECTIONS = [
    {
        "id": "sec-1",
        "title": "1. Executive Summary",
        "status": "",
        "body": (
            "Following written approval of technical documentation "
            f"{PRIOR_REPORT} and selection of **Option 2 — Local troubleshooting**, "
            "Honic Company Limited has completed the repair and return-to-service work "
            "on the YXLON ANDREX SMART 583 (S/N 81226) XRS power supply system for "
            "Tanzania Steel Pipes Limited.\n\n"
            "Local component-level troubleshooting and repair were carried out on the "
            "affected power stages. After repair, the system was tested and verified. "
            "The machine now starts and operates for intended NDT use under normal "
            "conditions. This report closes the Option 2 work scope linked to invoice "
            f"{INVOICE_NUMBER}."
        ),
    },
    {
        "id": "sec-2",
        "title": "2. References",
        "status": "",
        "body": (
            f"**Diagnostic report:** {PRIOR_REPORT} (issued 2026-07-22)\n"
            f"**Commercial document:** {INVOICE_NUMBER} — Option 2 Local troubleshooting\n"
            "**Selected option:** Option 2 — Local troubleshooting "
            "(6-month warranty for follow-up visit and inspection)\n"
            "**Payment terms:** Payment due after completion of the work "
            "(as stated on the approved technical documentation / invoice)."
        ),
    },
    {
        "id": "sec-3",
        "title": "3. Work Performed",
        "status": "Status: Completed",
        "body": (
            "Work completed under Option 2 includes:\n\n"
            "1. Re-confirmation of fault conditions on the XRS power rails and "
            "isolation of failed stages identified in the diagnostic report.\n"
            "2. Local advanced troubleshooting — multi-rail isolation, load and "
            "startup tests.\n"
            "3. Component-level repair on the 27V booster and 15V buck stages and "
            "related support circuitry, using locally available converter modules "
            "and discrete components (buck/boost converters, filter capacitors, "
            "fuses, MOSFETs / switching devices, thermal materials, connectors, "
            "and soldering consumables).\n"
            "4. Stabilisation measures on the 5V path using local troubleshooting "
            "methods (full imported 5V PSU module replacement — Option 1 — was "
            "not performed under this scope).\n"
            "5. System testing, verification, and return-to-service checks."
        ),
    },
    {
        "id": "sec-4",
        "title": "4. Post-Repair Verification",
        "status": "Status: Passed",
        "body": (
            "After repair, the following checks were performed:\n\n"
            "**Stage 1 — 5V rail:** Starts and remains stable under local "
            "troubleshooting configuration for the completed Option 2 scope.\n\n"
            "**Stage 2 — 24V (5A) main supply:** Remains within specification "
            "(as previously confirmed).\n\n"
            "**Stage 3 — 27V booster & 15V buck:** Restored after component-level "
            "repair; voltages measured within acceptable operating limits under test.\n\n"
            "**System level:** ANDREX SMART display and XRS Controller monitor "
            "power up correctly. Startup no longer fails with blank screens under "
            "the tested conditions. The unit was returned to service for NDT "
            "operation on spiral steel pipes."
        ),
    },
    {
        "id": "sec-5",
        "title": "5. Final Equipment Status",
        "status": "Status: Returned to service",
        "body": (
            "The ANDREX SMART 583 (S/N 81226) is released for operational use "
            "following Option 2 local troubleshooting and repair.\n\n"
            "Full imported 5V PSU module replacement (Option 1) was **not** "
            "included in this job. If Option 1 is required later, a separate "
            "quotation / invoice will be issued."
        ),
    },
    {
        "id": "sec-6",
        "title": "6. Warranty",
        "status": "",
        "body": (
            "Under Option 2, this completion includes a **6-month warranty covering "
            "follow-up visit and inspection** related to the completed "
            "troubleshooting work. If related faults reappear within six (6) months "
            "from the report date, Honic will arrange a follow-up visit and "
            "inspection as covered under invoice "
            f"{INVOICE_NUMBER}.\n\n"
            "Warranty does not cover unrelated failures, misuse, third-party "
            "modifications, or a later decision to proceed with full Option 1 "
            "imported PSU replacement."
        ),
    },
    {
        "id": "sec-7",
        "title": "7. Commercial Closure",
        "status": "",
        "body": (
            f"Job completion is documented against invoice {INVOICE_NUMBER}. "
            "As agreed for Option 2, **payment is due after the work is completed**. "
            "Please settle the invoice amount and retain this report together with "
            f"{PRIOR_REPORT} and {INVOICE_NUMBER} as the job record."
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
        "reportTitle": "TECHNICAL JOB COMPLETION REPORT",
        "documentRevision": "Rev. 00",
        "confidentiality": "Confidential — issued for Tanzania Steel Pipes Limited only",
        "clientName": "Tanzania Steel Pipes Limited",
        "toName": "Tanzania Steel Pipes Limited",
        "toAddress": CLIENT_ADDRESS,
        "clientAddress": CLIENT_ADDRESS,
        "fromName": "Honic Company Limited",
        "fromAddress": (
            "42 Bibi Titi Road\n"
            "DIT CEITT Building, 3rd Floor\n"
            "P.O. Box 2958\n"
            "Dar es Salaam, Tanzania"
        ),
        "fromEmail": "support@honiccompany.com",
        "fromPhone": "+255 763 818138 / +255 786 957 939",
        "companyWebsite": "www.honiccompanystore.com",
        "companyTagline": "INNOVATIONS AND RESEARCH",
        "footerPhone": "+255 786 957 939",
        "footerEmail": "support@honiccompany.com",
        "footerAddress": COMPANY_ADDRESS_FOOTER,
        "issueDate": REPORT_DATE,
        "reportDate": REPORT_DATE,
        "machineName": "ANDREX SMART 583",
        "serialNumber": "81226",
        "application": "Non-Medical / Non-Destructive Testing (NDT) (testing spiral steel pipes)",
        "subject": (
            "Job Completion — Option 2 Local Troubleshooting "
            "(XRS Power Supply) – YXLON ANDREX SMART 583"
        ),
        "problemDescription": PROBLEM_DESCRIPTION,
        "closureNote": (
            f"This report confirms completion of Option 2 work described in {PRIOR_REPORT} "
            f"and invoiced under {INVOICE_NUMBER}.\n\n"
            "Please acknowledge receipt of the repaired / returned equipment and this "
            "completion report. Payment is due after completion of the work as agreed "
            "for Option 2.\n\n"
            "Warranty: 6-month follow-up visit and inspection cover from the report date, "
            "as stated in Section 6."
        ),
        "preparedByName": "Authorized Signatory",
        "preparedByTitle": "Engineering / Repair Team",
        "signerName": "Authorized Signatory",
        "signerTitle": "Engineering / Repair Team",
        "sections": SECTIONS,
        "stampImage": STAMP_PUBLIC_URL,
        "invoiceLogo": LOGO_PUBLIC_URL,
        "signatureImage": SIGNATURE_PUBLIC_URL,
        "linkedInvoiceNumber": INVOICE_NUMBER,
        "linkedTechnicalReport": PRIOR_REPORT,
        "currency": "TZS",
        "totals": {"subtotal": 0, "taxAmount": 0, "grandTotal": 0},
    }

    now = datetime.now(timezone.utc).isoformat()
    record = {
        "invoice_number": REPORT_NUMBER,
        "client_name": "Tanzania Steel Pipes Limited",
        "issue_date": REPORT_DATE,
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
    report_id = first.get("id", rid)
    print(
        json.dumps(
            {
                action: True,
                "id": report_id,
                "report_number": REPORT_NUMBER,
                "title": "TECHNICAL JOB COMPLETION REPORT",
                "client": "Tanzania Steel Pipes Limited",
                "machine": "ANDREX SMART 583",
                "prior_report": PRIOR_REPORT,
                "invoice": INVOICE_NUMBER,
                "edit_url": f"/dashboard/technical-reports?invoiceId={report_id}&mode=edit",
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
