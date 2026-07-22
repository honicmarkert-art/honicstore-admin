"""Extract brand logo from an existing invoice and upload to public storage."""
import json
import os
import re
from pathlib import Path
from urllib import error, request

SOURCE_INVOICE = "INV-2026-HCIR-0046"
STORAGE_PATH = "invoices/admin/logo/company-logo.jpg"


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
            headers["x-upsert"] = "true"
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

    from urllib import parse

    safe = parse.quote(SOURCE_INVOICE, safe="")
    status, rows = supabase_request(
        "GET",
        f"{base}/rest/v1/invoices?select=payload&invoice_number=eq.{safe}&limit=1",
        apikey,
    )
    if status >= 400 or not isinstance(rows, list) or not rows:
        raise SystemExit(f"Source invoice not found: {rows}")

    logo = str((rows[0].get("payload") or {}).get("invoiceLogo") or "")
    m = re.match(r"^data:([^;]+);base64,(.+)$", logo, re.DOTALL)
    if not m:
        raise SystemExit("Source invoice has no data-URL logo")

    mime, b64 = m.group(1), m.group(2)
    import base64

    blob = base64.b64decode(b64)
    ext = "jpg" if "jpeg" in mime or "jpg" in mime else "png"
    path = STORAGE_PATH if STORAGE_PATH.endswith((".jpg", ".png")) else f"{STORAGE_PATH}.{ext}"

    out_local = repo_root / "public" / "report-assets" / "company-logo.jpg"
    out_local.parent.mkdir(parents=True, exist_ok=True)
    out_local.write_bytes(blob)

    status, data = supabase_request(
        "POST",
        f"{base}/storage/v1/object/invoice-assets/{path}?upsert=true",
        apikey,
        body=blob,
        content_type=mime,
        raw=True,
    )
    if status >= 400:
        status, data = supabase_request(
            "PUT",
            f"{base}/storage/v1/object/invoice-assets/{path}",
            apikey,
            body=blob,
            content_type=mime,
            raw=True,
        )
    if status >= 400:
        raise SystemExit(f"Upload failed ({status}): {data}")

    public_url = f"{base}/storage/v1/object/public/invoice-assets/{path}"
    print(json.dumps({"uploaded": True, "logo_url": public_url, "bytes": len(blob), "local": str(out_local)}, indent=2))


if __name__ == "__main__":
    main()
