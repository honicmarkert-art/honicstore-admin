const STACK_KEY = "honic-project-page-stack"
const BACK_KEY = "honic-project-back"

function readStack(): string[] {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(STACK_KEY) || "[]")
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : []
  } catch {
    return []
  }
}

function writeStack(stack: string[]) {
  sessionStorage.setItem(STACK_KEY, JSON.stringify(stack.slice(-25)))
}

export function rememberProjectPage(path: string) {
  if (typeof window === "undefined" || !path.startsWith("/projectdashboard")) return
  if (sessionStorage.getItem(BACK_KEY) === "1") {
    sessionStorage.removeItem(BACK_KEY)
    return
  }
  const stack = readStack()
  if (stack[stack.length - 1] === path) return
  stack.push(path)
  writeStack(stack)
}

export function previousProjectPage(current: string): string {
  const stack = readStack()
  if (stack[stack.length - 1] === current) stack.pop()
  const previous = stack[stack.length - 1]
  writeStack(stack)
  sessionStorage.setItem(BACK_KEY, "1")
  if (previous && previous !== current) return previous
  const pathOnly = current.split("?")[0]
  const parent = pathOnly.split("/").slice(0, -1).join("/") || "/projectdashboard"
  return parent.startsWith("/projectdashboard") ? parent : "/projectdashboard"
}
