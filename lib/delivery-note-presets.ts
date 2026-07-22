export type DeliveryNotePresetItem = {
  description: string
  quantity: number
  unitPrice?: number
}

export type DeliveryNotePreset = {
  id: string
  label: string
  billToName: string
  billToAddress?: string
  referenceNumber: string
  fromName?: string
  fromEmail?: string
  fromPhone?: string
  items: DeliveryNotePresetItem[]
}

/** Parsed from Quotation to Twende Tanzania.pdf (HC-PI-2026-017). */
export const TWENDE_TANZANIA_PRESET: DeliveryNotePreset = {
  id: "twende-tanzania",
  label: "Twende Tanzania (HC-PI-2026-017)",
  billToName: "Twende Tanzania",
  billToAddress: "Arusha, Tanzania",
  referenceNumber: "HC-PI-2026-017",
  fromName: "Honic Company Limited",
  fromEmail: "sales@honiccompanystore.com",
  fromPhone: "+255 763 818138 / 627 377461",
  items: [
    { description: "Digital Oscilloscope 2-channel 100MHz (1014D)", quantity: 2, unitPrice: 553000 },
    { description: "Signal Generator Dual channel DDS (FY600-20MHz)", quantity: 1, unitPrice: 315000 },
    { description: "IoT Starter Kits — ESP32 kit, 30 models", quantity: 2, unitPrice: 135000 },
    { description: "Robotic Starter Kit — Arduino UNO, 4WD chassis, 3WD chassis, Battery 3S, 24 models", quantity: 3, unitPrice: 99000 },
    { description: "Servo Motor SG90", quantity: 5, unitPrice: 11000 },
    { description: "Servo Motor MG90S", quantity: 5, unitPrice: 11000 },
    { description: "DC Gear Motor 5V BO Gear Motor", quantity: 10, unitPrice: 5000 },
    { description: "Sensor Kit — 37 sensors", quantity: 5, unitPrice: 53000 },
    { description: "Arduino Uno Board — Arduino Uno R4 Minima", quantity: 5, unitPrice: 83600 },
    { description: "Arduino Uno Board — Arduino Uno R4 Wi-Fi", quantity: 5, unitPrice: 116600 },
    { description: "Perfboards Assorted Kit (30 pcs)", quantity: 1, unitPrice: 40000 },
    { description: "Breadboard MB-102 (830 holes)", quantity: 15, unitPrice: 6000 },
    { description: "Jumpers & Connectors — JST XH 20cm male cable + female connector", quantity: 200, unitPrice: 800 },
    { description: "Soldering Station 952D 700W", quantity: 3, unitPrice: 210000 },
    { description: "Digital Multimeter UNI-T UT61B+ Auto", quantity: 5, unitPrice: 165000 },
    { description: "Bench Power Supply SPS 3010M 30V / 5A", quantity: 3, unitPrice: 423000 },
    { description: "Resistor Assorted Kit — 41 types, 20 each (820 pcs)", quantity: 1, unitPrice: 42400 },
    { description: "Transistor Assorted Kit — 24 types, 35 each (840 pcs)", quantity: 1, unitPrice: 53000 },
    { description: "Diode Assorted Kit — 10 types, 20 each (200 pcs)", quantity: 1, unitPrice: 33000 },
    { description: "PCB Board — single sided FR4", quantity: 2, unitPrice: 12000 },
    { description: "Stepper Motor NEMA 17 + Driver A4988", quantity: 5, unitPrice: 38500 },
    { description: "Stepper Motor 28BYJ-48 + Driver ULN2003", quantity: 5, unitPrice: 15000 },
    { description: "ATmega IC ATmega328PU + 28-pin socket", quantity: 10, unitPrice: 11000 },
    { description: "Crystal Oscillator Assorted Kit — 10 types, 20 each (200 pcs)", quantity: 1, unitPrice: 43000 },
    { description: "Ceramic Capacitor Assorted Kit — 10 types, 50 each (500 pcs)", quantity: 1, unitPrice: 30000 },
    { description: "Electrolytic Capacitor Assorted Kit — 24 types, 20 each (500 pcs)", quantity: 1, unitPrice: 55000 },
    { description: "Regulator Assorted Kit", quantity: 1, unitPrice: 55000 },
    { description: "Jumper Wires Bundle — M-M, F-M, F-F", quantity: 15, unitPrice: 4000 },
    { description: "LED Assorted Kit — 5 types, 20 each (100 pcs)", quantity: 2, unitPrice: 45000 },
    { description: "Switch DPST 2-Pin", quantity: 10, unitPrice: 300 },
    { description: "Push Button Assorted Kit — 10 types, 20 each (200 pcs)", quantity: 1, unitPrice: 26000 },
    { description: "Relay Module SRD-05DC-SL-C", quantity: 5, unitPrice: 4000 },
  ],
}

const PRESETS: Record<string, DeliveryNotePreset> = {
  [TWENDE_TANZANIA_PRESET.id]: TWENDE_TANZANIA_PRESET,
}

export function getDeliveryNotePreset(id: string): DeliveryNotePreset | undefined {
  return PRESETS[id.trim().toLowerCase()]
}

export function getDeliveryNotePresetByReference(referenceNumber: string): DeliveryNotePreset | undefined {
  const ref = referenceNumber.trim().toLowerCase()
  if (!ref) return undefined
  return Object.values(PRESETS).find((p) => p.referenceNumber.trim().toLowerCase() === ref)
}

function normalizeItemLabel(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

export type SourceLinePrice = {
  description: string
  quantity: number
  unitPrice: number
}

export function applyDocumentPricesToItems<T extends { description: string; quantity: number; unitPrice: number }>(
  items: T[],
  sourceItems: SourceLinePrice[]
): T[] {
  if (!sourceItems.length) return items
  const byLabel = new Map<string, SourceLinePrice>()
  for (const src of sourceItems) {
    const key = normalizeItemLabel(src.description)
    if (key) byLabel.set(key, src)
  }
  return items.map((item, index) => {
    const key = normalizeItemLabel(item.description)
    const match = (key && byLabel.get(key)) || sourceItems[index]
    if (!match) return item
    return { ...item, unitPrice: Number(match.unitPrice || 0) }
  })
}

export function presetToSourceLinePrices(preset: DeliveryNotePreset): SourceLinePrice[] {
  return preset.items.map((it) => ({
    description: it.description,
    quantity: it.quantity,
    unitPrice: Number(it.unitPrice || 0),
  }))
}
