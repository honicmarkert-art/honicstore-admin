import { redirect } from "next/navigation"

/** Shortcut: Twende Tanzania delivery note from quotation HC-PI-2026-017 */
export default function ProjectTwendeDeliveryNotePage() {
  redirect("/projectdashboard/delivery-note?preset=twende-tanzania")
}
