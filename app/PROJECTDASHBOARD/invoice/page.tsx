"use client"

import AdminInvoicesPage from "@/app/dashboard/invoices/page"

export default function ProjectDashboardInvoicePage() {
  return (
    <AdminInvoicesPage
      dashboardScope="project"
      savedListHref="/projectdashboard/invoices/list"
      initialValues={{
        fromName: "Honic Company Limited",
        companyTagline: "INOVATIONS AND RESEARCH",
        companyWebsite: "inova.honiccompany.com",
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
            rows: [{ sn: "1", item: "e.g. Arduino / Sensor / Pump", qty: "e.g. 1", unitPrice: "e.g. 25,000", totalPrice: "e.g. 25,000" }],
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
            rows: [{ sn: "1", item: "e.g. Circuit casing / Water tank", qty: "e.g. 1", unitPrice: "e.g. 15,000", totalPrice: "e.g. 15,000" }],
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
            rows: [{ sn: "1", item: "e.g. Installation / Testing", qty: "e.g. 1", unitPrice: "e.g. 120,000", amount: "e.g. 120,000" }],
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
          "**1.** The above costs do not include expenses related to project documentation, including circuit simulation, block diagram development, or data analysis. Only component specifications are provided.\n\n**2.** The final cost may vary depending on design changes or additional requirements, which may result in an increase or decrease in price.\n\n**3.** This document can be used as proforma invoice or a tax invoice.\n\n**4.** The circuit casing highlighted in red indicates that its cost is not yet known. The cost will only be determined after the circuit casing has been drawn; once the price is confirmed, you will be notified.",
      }}
    />
  )
}
