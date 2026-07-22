"""Copy company stamp from a project invoice into the electronics components quotation."""
import base64
import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from urllib import error, parse, request

SOURCE_INVOICE_NUMBER = "INV-2026-HCIR-0046"
TARGET_INVOICE_NUMBER = "QTE-2026-45-COMP-ELECTRONICS"
STAMP_STORAGE_PATH = "invoices/admin/stamp/company-stamp.jpg"


def load_env(env_path: Path) -> None:
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def supabase_request(method: str, url: str, apikey: str, body=None, extra_headers=None):
    headers = {"apikey": apikey, "Authorization": f"Bearer {apikey}"}
    if extra_headers:
        headers.update(extra_headers)
    data = body
    if body is not None and not isinstance(body, (bytes, bytearray)):
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


def fetch_by_number(base_url: str, apikey: str, invoice_number: str) -> dict | None:
    safe = parse.quote(invoice_number, safe="")
    status, data = supabase_request(
        "GET",
        f"{base_url}/rest/v1/invoices?select=id,invoice_number,payload&invoice_number=eq.{safe}&limit=1",
        apikey,
    )
    if status >= 400 or not isinstance(data, list) or not data:
        return None
    return data[0]


def stamp_to_bytes(stamp: str) -> tuple[bytes, str]:
    if stamp.startswith("http://") or stamp.startswith("https://"):
        req = request.Request(stamp)
        with request.urlopen(req) as resp:
            content_type = resp.headers.get("Content-Type", "image/jpeg")
            return resp.read(), content_type
    match = re.match(r"^data:([^;]+);base64,(.+)$", stamp)
    if not match:
        raise SystemExit("Unsupported stamp format")
    mime, encoded = match.groups()
    return base64.b64decode(encoded), mime


def upload_stamp_public_url(base_url: str, apikey: str, stamp: str, bucket: str) -> str:
    body, content_type = stamp_to_bytes(stamp)
    object_path = STAMP_STORAGE_PATH
    upload_url = f"{base_url}/storage/v1/object/{bucket}/{object_path}"
    status, data = supabase_request(
        "POST",
        upload_url,
        apikey,
        body=body,
        extra_headers={
            "Content-Type": content_type,
            "x-upsert": "true",
        },
    )
    if status >= 400:
        raise SystemExit(f"Stamp upload failed ({status}): {json.dumps(data, ensure_ascii=False)}")
    return f"{base_url}/storage/v1/object/public/{bucket}/{object_path}"


def main():
    repo_root = Path(__file__).resolve().parents[1]
    load_env(repo_root / ".env.local")
    supabase_url = os.getenv("NEXT_PUBLIC_SUPABASE_URL", "").rstrip("/")
    apikey = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
    bucket = os.getenv("SUPABASE_INVOICE_ASSETS_BUCKET", "invoice-assets")
    if not supabase_url or not apikey:
        raise SystemExit("Missing Supabase env vars")

    source = fetch_by_number(supabase_url, apikey, SOURCE_INVOICE_NUMBER)
    target = fetch_by_number(supabase_url, apikey, TARGET_INVOICE_NUMBER)
    if not source:
        raise SystemExit(f"Source invoice not found: {SOURCE_INVOICE_NUMBER}")
    if not target:
        raise SystemExit(f"Target quotation not found: {TARGET_INVOICE_NUMBER}")

    stamp = (source.get("payload") or {}).get("stampImage")
    if not stamp:
        raise SystemExit(f"No stamp on source invoice {SOURCE_INVOICE_NUMBER}")

    stamp_url = upload_stamp_public_url(supabase_url, apikey, stamp, bucket)

    payload = dict(target.get("payload") or {})
    payload["stampImage"] = stamp_url

    status, data = supabase_request(
        "PATCH",
        f"{supabase_url}/rest/v1/invoices?id=eq.{target['id']}",
        apikey,
        {
            "payload": payload,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        },
    )
    if status >= 400:
        raise SystemExit(f"Update failed ({status}): {json.dumps(data, ensure_ascii=False)}")

    print(
        json.dumps(
            {
                "updated": True,
                "target_id": target["id"],
                "target_invoice_number": TARGET_INVOICE_NUMBER,
                "stamp_copied_from": SOURCE_INVOICE_NUMBER,
                "stamp_url": stamp_url,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
