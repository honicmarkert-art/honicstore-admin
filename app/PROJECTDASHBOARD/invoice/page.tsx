"use client"

import AdminInvoicesPage from "@/app/dashboard/invoices/page"

export default function ProjectDashboardInvoicePage() {
  return (
    <AdminInvoicesPage
      dashboardScope="project"
      savedListHref="/PROJECTDASHBOARD/invoices/list"
      initialValues={{
        fromName: "Honic Company Limited",
        companyTagline: "INOVATIONS AND RESEARCH",
        companyWebsite: "inr.honiccompany.com",
      }}
      extraTables={{
        sections: [
          {
            title: "Electrical and Electronics Components Prices",
            columns: [
              { key: "sn", label: "S/N", align: "center" },
              { key: "item", label: "Item" },
              { key: "qty", label: "Qty", align: "center" },
              { key: "unitPrice", label: "Unit price", align: "right" },
              { key: "totalPrice", label: "Total price", align: "right" },
            ],
            rows: [
              { sn: "1", item: "e.g. Arduino / Sensor / Pump", qty: "e.g. 1", unitPrice: "e.g. 25,000", totalPrice: "e.g. 25,000" },
            ],
          },
          {
            title: "Prototype Items",
            columns: [
              { key: "sn", label: "S/N", align: "center" },
              { key: "item", label: "Item" },
              { key: "qty", label: "Qty", align: "center" },
              { key: "unitPrice", label: "Unit price", align: "right" },
              { key: "totalPrice", label: "Total price", align: "right" },
            ],
            rows: [
              { sn: "1", item: "e.g. Circuit casing / Water tank", qty: "e.g. 1", unitPrice: "e.g. 15,000", totalPrice: "e.g. 15,000" },
            ],
          },
          {
            title: "Service Cost",
            columns: [
              { key: "sn", label: "S/N", align: "center" },
              { key: "item", label: "Item" },
              { key: "qty", label: "Qty", align: "center" },
              { key: "unitPrice", label: "Unit price", align: "right" },
              { key: "amount", label: "Total", align: "right" },
            ],
            rows: [
              {
                sn: "1",
                item: "e.g. Installation / Testing",
                qty: "e.g. 1",
                unitPrice: "e.g. 120,000",
                amount: "e.g. 120,000",
              },
            ],
          },
        ],
        paymentSchedule: [
          { phase: "1", description: "", amount: "", amountToPay: "", deadline: "01/01/26" },
          { phase: "2", description: "", amount: "", amountToPay: "", deadline: "01/04/26" },
          { phase: "3", description: "", amount: "", amountToPay: "", deadline: "21/05/26" },
          { phase: "4", description: "", amount: "", amountToPay: "", deadline: "10/06/26" },
        ],
        paymentGrandTotal: "",
        paymentDeadline: "160 Days",
        note:
          "NOTE:\n- This project cost includes implementation, simulation, block diagram development, and data analysis.\n- Component specifications may be adjusted based on final requirements.\n- Final amount may change due to design revisions or additional scope.\n- This document is a proforma estimate and not a tax invoice.",
      }}
    />
  )
}
