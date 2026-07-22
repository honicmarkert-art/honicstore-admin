"""Upload whitened signature to Supabase and attach to TR-2026-0001."""
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from urllib import error, parse, request

REPORT_NUMBER = "TR-2026-0001"
SIGNATURE_PATH = Path(
    r"E:\Honicstore-main\honicstore-admin\public\report-assets\prepared-by-signature-white.png"
)
STORAGE_PATH = "invoices/admin/signature/prepared-by-signature-white-v2.png"


def load_env(env_path: Path) -> None:
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def supabase_request(method: str, url: str, apikey: str, body=None, content_type=None, raw=False):
    headers = {"apikey": apikey, "Authorization": f"Bearer {apikey}"}
    data = None
    if body is not None:
        if raw:
            headers["Content-Type"] = content_type or "application/octet-stream"
            data = body
        else:
            headers["Content-Type"] = "application/json"
            headers["Prefer"] = "return=representation"
            data = json.dumps(body).encode("utf-8")
    req = request.Request(url, method=method, headers=headers, data=data)
    try:
        with request.urlopen(req) as resp:
            raw_body = resp.read().decode("utf-8")
            if not raw_body:
                return resp.status, None
            try:
                return resp.status, json.loads(raw_body)
            except Exception:
                return resp.status, raw_body
    except error.HTTPError as e:
        raw_body = e.read().decode("utf-8")
        try:
            payload = json.loads(raw_body)
        except Exception:
            payload = {"error": raw_body}
        return e.code, payload


def main():
    repo_root = Path(__file__).resolve().parents[1]
    load_env(repo_root / ".env.local")
    base = os.getenv("NEXT_PUBLIC_SUPABASE_URL", "").rstrip("/")
    apikey = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
    if not base or not apikey:
        raise SystemExit("Missing Supabase env vars")
    if not SIGNATURE_PATH.exists():
        raise SystemExit(f"Missing signature file: {SIGNATURE_PATH}")

    blob = SIGNATURE_PATH.read_bytes()
    upload_url = f"{base}/storage/v1/object/invoice-assets/{STORAGE_PATH}"
    # upsert
    status, data = supabase_request(
        "POST",
        upload_url + "?upsert=true",
        apikey,
        body=blob,
        content_type="image/png",
        raw=True,
    )
    if status >= 400:
        # try PUT upsert style
        status, data = supabase_request(
            "PUT",
            upload_url,
            apikey,
            body=blob,
            content_type="image/png",
            raw=True,
        )
    if status >= 400:
        raise SystemExit(f"Upload failed ({status}): {data}")

    public_url = f"{base}/storage/v1/object/public/invoice-assets/{STORAGE_PATH}"

    safe = parse.quote(REPORT_NUMBER, safe="")
    status, rows = supabase_request(
        "GET",
        f"{base}/rest/v1/invoices?select=id,payload&invoice_number=eq.{safe}&limit=1",
        apikey,
    )
    if status >= 400 or not isinstance(rows, list) or not rows:
        raise SystemExit(f"Report not found: {rows}")

    row = rows[0]
    payload = dict(row.get("payload") or {})
    payload["signatureImage"] = public_url
    now = datetime.now(timezone.utc).isoformat()
    status, updated = supabase_request(
        "PATCH",
        f"{base}/rest/v1/invoices?id=eq.{row['id']}",
        apikey,
        {"payload": payload, "updated_at": now},
    )
    if status >= 400:
        raise SystemExit(f"Update failed ({status}): {updated}")

    print(
        json.dumps(
            {
                "uploaded": True,
                "signature_url": public_url,
                "report_id": row["id"],
                "report_number": REPORT_NUMBER,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
