"use client"

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import { currentProjectYear, projectYearOptions } from "@/lib/project-year"

const STORAGE_KEY = "honic-project-year"

type ProjectYearValue = {
  year: number
  setYear: (year: number) => void
  years: number[]
}

const ProjectYearContext = createContext<ProjectYearValue | null>(null)

export function ProjectYearProvider({ children }: { children: ReactNode }) {
  const years = useMemo(() => projectYearOptions(), [])
  const [year, setYearState] = useState(() => currentProjectYear())

  useEffect(() => {
    const saved = Number(window.localStorage.getItem(STORAGE_KEY))
    if (years.includes(saved)) setYearState(saved)
  }, [years])

  const setYear = (next: number) => {
    if (!years.includes(next)) return
    setYearState(next)
    window.localStorage.setItem(STORAGE_KEY, String(next))
  }

  return <ProjectYearContext.Provider value={{ year, setYear, years }}>{children}</ProjectYearContext.Provider>
}

export function useProjectYear(): ProjectYearValue | null {
  return useContext(ProjectYearContext)
}
