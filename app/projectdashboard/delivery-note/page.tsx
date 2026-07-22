"use client"

import AdminInvoicesPage from "@/app/dashboard/invoices/page"

export default function ProjectDashboardDeliveryNotePage() {
  return (
    <AdminInvoicesPage
      dashboardScope="project"
      savedListHref="/projectdashboard/delivery-notes/list"
      initialDocumentKind="delivery_note"
      lockDocumentKind
      initialValues={{
        fromName: "Honic Company Limited",
        companyTagline: "INOVATIONS AND RESEARCH",
        companyWebsite: "inova.honiccompany.com",
      }}
    />
  )
}

