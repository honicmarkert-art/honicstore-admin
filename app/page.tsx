export default function AdminDashboard() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-4">Honicstore Admin Dashboard</h1>
        <p className="text-muted-foreground mb-2">
          Admin API routes are available at /api/admin/*
        </p>
        <p className="text-sm text-muted-foreground">
          Deployed on Vercel - siem.honiccompanystore.com
        </p>
        <p className="text-xs text-muted-foreground mt-4">
          Version: 1.0.0
        </p>
      </div>
    </div>
  )
}
