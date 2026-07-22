export type ReportSection = {
  id: string
  title: string
  body: string
  /** Optional status chip shown next to title, e.g. Dead / Working / Failed */
  status?: string
  statusTone?: "danger" | "ok" | "warn" | "neutral"
}

export type TechnicalReportDefaults = {
  reportNumber: string
  reportTitle: string
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
  subject: string
  attachmentNote: string
  nextSteps: string
  preparedByName: string
  preparedByTitle: string
  sections: ReportSection[]
}

/** First seeded report: PSU diagnostic & repair plan (no parts table — proforma attached separately). */
export const PSU_DIAGNOSTIC_REPORT: TechnicalReportDefaults = {
  reportNumber: "TR-2026-0001",
  reportTitle: "TECHNICAL DIAGNOSTIC & REPAIR REPORT",
  toName: "Client Management",
  toAddress: "",
  fromName: "Honic Company Limited",
  fromEmail: "support@honiccompany.com",
  fromPhone: "+255 763 818138 / +255 786 957 939",
  companyWebsite: "www.honiccompanystore.com",
  companyTagline: "INNOVATIONS AND RESEARCH",
  footerPhone: "+255 786 957 939",
  footerEmail: "support@honiccompany.com",
  footerAddress: "Dar es Salaam, Tanzania",
  reportDate: "2026-07-22",
  machineName: "",
  subject: "Power Supply Unit (PSU) Inspection and Repair Plan",
  attachmentNote:
    "This technical report is issued together with a separate proforma invoice that lists required parts, quantities, and costs. Please review the attached proforma for procurement and budget approval.",
  nextSteps:
    "The machine cannot run safely in its current state. To begin the repair process, we need:\n\n1. Formal approval of this report and the repair strategy.\n2. Approval of the procurement budget (see attached proforma invoice) to import the parts.",
  preparedByName: "Authorized Signatory",
  preparedByTitle: "Engineering / Repair Team",
  sections: [
    {
      id: "sec-1",
      title: "1. Executive Summary",
      body:
        "We completed an inspection (ukaguzi) of the machine’s power supply system. The power system splits electricity into different voltage stages to run the machine. We found major faults causing the machine to shut down. To restore stable, high-quality operation, we must replace one dead power module and repair two failed circuits on another board.",
      statusTone: "neutral",
    },
    {
      id: "sec-2a",
      title: "2. Diagnostic Findings — Stage 1: 5V (7A) External Power Supply",
      status: "Completely Dead / Unstable",
      statusTone: "danger",
      body:
        "This is a separate power box mounted inside the main unit. We troubleshot the system and got it to turn on, but it does not work for long. It runs for a few minutes and then goes completely off. It is completely unreliable.",
    },
    {
      id: "sec-2b",
      title: "Stage 2: 24V (5A) Main Power Supply",
      status: "Working Perfectly",
      statusTone: "ok",
      body: "Voltage measurements are stable and within normal limits.",
    },
    {
      id: "sec-2c",
      title: "Stage 3: 27V Booster & 15V Buck Circuits",
      status: "Failed (But Repairable)",
      statusTone: "warn",
      body:
        "These are two separate circuits built onto the 24V power board. The 27V Booster and the 15V Buck have both failed. However, the main circuit board itself is healthy. We can fix this part by replacing the broken individual components with brand-new ones.",
    },
    {
      id: "sec-3",
      title: "3. Recommendations & Action Plan",
      body:
        "Full Replacement of the 5V PSU: We recommend replacing the 5V unit with a brand-new module. Repairing the old one is not reliable. A new part guarantees long-term machine efficiency and quality performance.\n\nComponent Repair for 27V & 15V Circuits: We recommend repairing these circuits by replacing the bad individual electronic components. We guarantee this will return this section to normal condition.",
    },
    {
      id: "sec-4",
      title: "4. Sourcing & Timeline Challenges",
      body:
        "The Challenge: Most of the repair components and the new 5V power supply are not available in the country.\n\nThe Solution: We must purchase and import these items from international suppliers abroad.\n\nTime Impact: Importing the parts will add some extra days of work. We will order everything immediately after you confirm that we should proceed.",
    },
    {
      id: "sec-5",
      title: "5. Commercial Attachment",
      body:
        "A detailed parts list, quantities, and cost estimate are provided in the attached proforma invoice (issued separately). This report covers technical findings and the recommended repair strategy only; commercial details are in the proforma attachment.",
    },
    {
      id: "sec-6",
      title: "6. Next Steps to Proceed",
      body:
        "The machine cannot run safely in its current state. To begin the repair process, we need:\n\n1. Formal approval of this report and the repair strategy.\n2. Approval of the procurement budget to import the parts (see attached proforma invoice).",
    },
  ],
}

export const STAMP_PUBLIC_URL =
  "https://qobobocldfjhdkpjyuuq.supabase.co/storage/v1/object/public/invoice-assets/invoices/admin/stamp/company-stamp.jpg"
