"""Build a project-completion sign-off PDF from unhidden project invoices."""
import os
from datetime import date
from pathlib import Path
from urllib import request
import json

from fpdf import FPDF


OUT_PATH = Path(__file__).resolve().parents[2] / "document" / "project-clients-signoff.pdf"


def load_env(env_path: Path) -> None:
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def fetch_unhidden_clients() -> list[str]:
    repo_root = Path(__file__).resolve().parents[1]
    load_env(repo_root / ".env.local")
    base = os.getenv("NEXT_PUBLIC_SUPABASE_URL", "").rstrip("/")
    apikey = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
    if not base or not apikey:
        raise SystemExit("Missing Supabase env vars")
    url = (
        f"{base}/rest/v1/invoices"
        "?select=client_name,payload"
        "&order=created_at.desc"
        "&limit=1000"
    )
    req = request.Request(url, headers={"apikey": apikey, "Authorization": f"Bearer {apikey}"})
    with request.urlopen(req) as resp:
        rows = json.loads(resp.read().decode("utf-8"))

    names: list[str] = []
    seen: set[str] = set()
    for row in rows:
        payload = row.get("payload") or {}
        if payload.get("usageTrackingRecord"):
            continue
        if str(payload.get("dashboardScope") or "") != "project":
            continue
        kind = str(payload.get("documentKind") or "invoice")
        if kind not in {"invoice", "quotation", ""}:
            continue
        if payload.get("hiddenFromList"):
            continue
        name = str(row.get("client_name") or "").strip()
        if not name:
            continue
        key = name.casefold()
        if key in seen:
            continue
        seen.add(key)
        names.append(name)
    names.sort(key=str.casefold)
    return names


class SignOffPDF(FPDF):
    def header(self) -> None:
        self.set_font("Helvetica", "B", 14)
        self.cell(0, 7, "HONIC COMPANY LIMITED", new_x="LMARGIN", new_y="NEXT", align="C")
        self.set_font("Helvetica", "B", 12)
        self.cell(0, 7, "BATCH 4", new_x="LMARGIN", new_y="NEXT", align="C")
        self.set_font("Helvetica", "", 9)
        self.cell(0, 5, "Project Dashboard  |  Unhidden customer sign-off sheet", new_x="LMARGIN", new_y="NEXT", align="C")
        self.set_font("Helvetica", "B", 11)
        self.cell(0, 7, "PROJECT COMPLETE / SEEN / CNFM / SIGNATURE", new_x="LMARGIN", new_y="NEXT", align="C")
        self.set_font("Helvetica", "", 8)
        self.cell(
            0,
            5,
            f"Date: {date.today().isoformat()}    Numbers start at 111    Source: /projectdashboard/invoices/list",
            new_x="LMARGIN",
            new_y="NEXT",
            align="C",
        )
        self.ln(2)

    def footer(self) -> None:
        self.set_y(-12)
        self.set_font("Helvetica", "", 8)
        self.cell(0, 8, f"Page {self.page_no()}/{{nb}}", align="C")


def main() -> None:
    names = fetch_unhidden_clients()
    pdf = SignOffPDF(orientation="L", unit="mm", format="A4")
    pdf.alias_nb_pages()
    pdf.set_auto_page_break(auto=True, margin=14)
    pdf.add_page()

    # Landscape A4 usable width ~ 277 mm
    col_sn = 12
    col_name = 85
    col_box = (277 - col_sn - col_name) / 4  # PROJECT COMPLETE, SEEN, CNFM, SIGNATURE
    headers = ["#", "CUSTOMER NAME", "PROJECT COMPLETE", "SEEN", "CNFM", "SIGNATURE"]
    widths = [col_sn, col_name, col_box, col_box, col_box, col_box]
    row_h = 12

    def draw_header_row() -> None:
        pdf.set_font("Helvetica", "B", 8)
        pdf.set_fill_color(15, 23, 42)
        pdf.set_text_color(255, 255, 255)
        for title, w in zip(headers, widths):
            pdf.cell(w, 8, title, border=1, align="C", fill=True)
        pdf.ln(8)
        pdf.set_text_color(0, 0, 0)

    draw_header_row()
    start_no = 111
    pdf.set_font("Helvetica", "", 9)
    for i, name in enumerate(names):
        if pdf.get_y() + row_h > 196:
            pdf.add_page()
            draw_header_row()
            pdf.set_font("Helvetica", "", 9)
        pdf.cell(widths[0], row_h, str(start_no + i), border=1, align="C")
        pdf.cell(widths[1], row_h, f"  {name}", border=1, align="L")
        for w in widths[2:]:
            pdf.cell(w, row_h, "", border=1)
        pdf.ln(row_h)

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    pdf.output(str(OUT_PATH))
    print(json.dumps({"clients": len(names), "path": str(OUT_PATH)}, indent=2))


if __name__ == "__main__":
    main()
