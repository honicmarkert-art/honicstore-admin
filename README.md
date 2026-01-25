# Honicstore Admin Dashboard

Admin dashboard for Honic Company Store e-commerce platform.

This is a separated admin application that contains all admin API routes and functionality, designed to be hosted on a separate subdomain: `siem.honiccompanystore.com`

## Features

- User Management
- Product Management
- Order Management
- Supplier Management
- Settings Management
- Advertisement Management
- Email Campaign Management
- Image Upload Management
- Category Management
- Payout Account Management

## Project Structure

```
honicstore-admin/
├── app/
│   ├── api/
│   │   └── admin/          # All admin API routes
│   ├── layout.tsx         # Root layout
│   ├── page.tsx           # Home page
│   └── globals.css        # Global styles
├── lib/                    # Shared utilities
│   ├── admin-auth.ts      # Admin authentication
│   ├── admin-api-wrapper.ts
│   ├── error-handler.ts
│   ├── logger.ts
│   └── ...                # Other utilities
└── components/             # React components (to be added)
```

## Setup

1. Install dependencies:
```bash
npm install
```

2. Copy `.env.example` to `.env.local` and fill in the required environment variables:
```bash
cp .env.example .env.local
```

3. Update `.env.local` with your actual values:
```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

4. Run development server:
```bash
npm run dev
```

The admin API routes will be available at `http://localhost:3000/api/admin/*`

## Deployment

### Vercel Deployment

1. Push this repository to a new GitHub repository
2. Import the project in Vercel
3. Configure the subdomain: `siem.honiccompanystore.com`
4. Add environment variables in Vercel dashboard
5. Deploy

### Environment Variables for Vercel

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SMTP_HOST` (if email functionality is needed)
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASSWORD`
- `CRON_SECRET` (for scheduled tasks)

## API Routes

All admin API routes are available under `/api/admin/*`:

- `/api/admin/users` - User management
- `/api/admin/orders` - Order management
- `/api/admin/products` - Product management
- `/api/admin/suppliers` - Supplier management
- `/api/admin/settings` - Settings management
- `/api/admin/advertisements` - Advertisement management
- `/api/admin/categories` - Category management
- And more...

## Git Repository

To push to a new repository:

```bash
# Add remote (replace with your repository URL)
git remote add origin https://github.com/your-username/honicstore-admin.git

# Push to remote
git push -u origin master
```

## Notes

- This is a separate application from the main honicstore app
- All admin functionality has been extracted here
- The main app can continue to operate without admin routes
- Both apps share the same Supabase database
