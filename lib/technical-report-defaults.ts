export type ReportSection = {
  id: string
  title: string
  body: string
  /** Status line under the title (shown bold dark blue — not a colored badge) */
  status?: string
}

export type TechnicalReportDefaults = {
  reportNumber: string
  reportTitle: string
  documentRevision: string
  confidentiality: string
  toName: string
  toAddress: string
  fromName: string
  fromEmail: string
  fromPhone: string
  companyWebsite: string
  companyTagline: string
  footerPhone: string
  footerEmail: string
  footerAddress: string
  reportDate: string
  machineName: string
  serialNumber: string
  application: string
  subject: string
  /** Client-reported problem (TSP header field — not repeated as a body section) */
  problemDescription: string
  /** Single closing note: proforma attachment + approval (not repeated in body sections) */
  closureNote: string
  preparedByName: string
  preparedByTitle: string
  sections: ReportSection[]
}

/** Tanzania Steel Pipes — YXLON ANDREX SMART 583 X-ray PSU diagnostic report. */
export const TSP_XRAY_PSU_REPORT: TechnicalReportDefaults = {
  reportNumber: "TR-2026-0001",
  reportTitle: "TECHNICAL DIAGNOSTIC & REPAIR REPORT",
  documentRevision: "Rev. 00",
  confidentiality: "Confidential — issued for Tanzania Steel Pipes Limited only",
  toName: "Tanzania Steel Pipes Limited",
  toAddress:
    "Plot 4, Ubungo Industrial Estate\nMorogoro Road\nP.O. Box 5476\nDar es Salaam, Tanzania\nTel: +255 (0)22-2450457\nEmail: info@tsp.co.tz",
  fromName: "Honic Company Limited",
  fromEmail: "support@honiccompany.com",
  fromPhone: "+255 763 818138 / +255 786 957 939",
  companyWebsite: "www.honiccompanystore.com",
  companyTagline: "INNOVATIONS AND RESEARCH",
  footerPhone: "+255 786 957 939",
  footerEmail: "support@honiccompany.com",
  footerAddress: "42 Bibi Titi Road, DIT CEITT Building, 3rd Floor, P.O. Box 2958, Dar es Salaam, Tanzania",
  reportDate: "2026-07-22",
  machineName: "ANDREX SMART 583",
  serialNumber: "81226",
  application: "Non-Medical / Non-Destructive Testing (NDT) (testing spiral steel pipes)",
  subject: "XRS Power Supply Failure – YXLON ANDREX SMART 583",
  problemDescription:
    "The X-ray inspection system fails to start. The ANDREX SMART display and XRS Controller monitor remain blank during startup.",
  closureNote:
    "Enclosure: Proforma / Invoice INV-2026-TSP-XRAY-PSU is attached (Option 1 costing).\n\n" +
    "Please confirm in writing which recommendation you select:\n" +
    "1. Full PSU part replacement — payment before kazi kuisha.\n" +
    "2. Local troubleshooting — 6-month warranty for visit and inspection.\n\n" +
    "Work proceeds only after that confirmation (and payment for Option 1).",
  preparedByName: "Authorized Signatory",
  preparedByTitle: "Engineering / Repair Team",
  sections: [
    {
      id: "sec-1",
      title: "1. Executive Summary",
      body:
        "We completed an inspection (ukaguzi) of the X-ray inspection system’s power supply. The power system splits electricity into different voltage stages to run the machine. We found major faults that prevent reliable startup and sustained operation. To restore stable, high-quality operation, one dead power module must be replaced and two failed circuits on another board must be repaired.",
    },
    {
      id: "sec-2",
      title: "2. Diagnostic Findings",
      body: "Findings are organised by power stage of the XRS power supply system.",
    },
    {
      id: "sec-2a",
      title: "2.1 Stage 1 — 5V (7A) External Power Supply",
      status: "Status: Completely dead / unstable",
      body:
        "This is a separate power box mounted inside the main unit. Troubleshooting restored temporary power, but the supply does not remain operational. It runs for only a few minutes, then shuts down completely. The module is unreliable and not fit for continued service.",
    },
    {
      id: "sec-2b",
      title: "2.2 Stage 2 — 24V (5A) Main Power Supply",
      status: "Status: Working within specification",
      body: "Voltage measurements are stable and within normal limits.",
    },
    {
      id: "sec-2c",
      title: "2.3 Stage 3 — 27V Booster & 15V Buck Circuits",
      status: "Status: Failed — repairable at component level",
      body:
        "These two circuits are built onto the 24V power board. Both the 27V booster and the 15V buck have failed. The main board substrate remains serviceable; failed discrete components can be replaced with new parts to restore this section.",
    },
    {
      id: "sec-3",
      title: "3. Recommendations & Action Plan",
      body:
        "Two options are available. The client should select one before work continues.\n\n" +
        "**Option 1 — Full PSU part replacement**\n" +
        "Replace the failed power-supply parts in full (external 5V module and required board-level components for 27V/15V stages) as listed on the linked invoice. " +
        "Payment must be completed **before kazi kuisha** (before repair work is finished / before final commissioning). " +
        "Imported parts are ordered only after payment confirmation.\n\n" +
        "**Option 2 — Local troubleshooting**\n" +
        "Continue local troubleshooting and component-level repair on site / in workshop using locally manageable steps, without waiting for full imported PSU module replacement as the primary path. " +
        "This option includes a **6-month warranty covering visit and inspection** after the troubleshooting work (follow-up site visit and inspection within six months if related faults reappear). " +
        "Parts that still require import will be quoted separately if needed.",
    },
    {
      id: "sec-4",
      title: "4. Sourcing & Timeline",
      body:
        "**Option 1:** Most full-replacement parts (including the 5V PSU) are not available locally and must be imported. Lead time applies after payment.\n\n" +
        "**Option 2:** Local troubleshooting starts after written approval. Imported items, if later required, follow a separate procurement step.\n\n" +
        "Ordering / on-site work starts only after the selected option is confirmed in writing.",
    },
  ],
}

/** @deprecated Use TSP_XRAY_PSU_REPORT */
export const PSU_DIAGNOSTIC_REPORT = TSP_XRAY_PSU_REPORT

export const STAMP_PUBLIC_URL =
  "https://qobobocldfjhdkpjyuuq.supabase.co/storage/v1/object/public/invoice-assets/invoices/admin/stamp/company-stamp.jpg"

export const SIGNATURE_PUBLIC_URL =
  "https://qobobocldfjhdkpjyuuq.supabase.co/storage/v1/object/public/invoice-assets/invoices/admin/signature/prepared-by-signature-white-v2.png"

export const LOGO_PUBLIC_URL =
  "https://qobobocldfjhdkpjyuuq.supabase.co/storage/v1/object/public/invoice-assets/invoices/admin/logo/company-logo.jpg"

/** Default Honic company address for document headers (multi-line). */
export const COMPANY_ADDRESS_DEFAULT =
  "42 Bibi Titi Road\nDIT CEITT Building, 3rd Floor\nP.O. Box 2958\nDar es Salaam, Tanzania"

/** Compact single-line address for footers / contact strips. */
export const COMPANY_ADDRESS_FOOTER =
  "42 Bibi Titi Road, DIT CEITT Building, 3rd Floor, P.O. Box 2958, Dar es Salaam, Tanzania"
