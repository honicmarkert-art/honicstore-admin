# Environment Variables Setup Guide

## Best Practice Recommendation

### ✅ Recommended Approach: Separate .env.local Files

**For Local Development:**
- Each app (main app and admin app) should have its own `.env.local` file
- Both files will contain the **same Supabase credentials** (since they share the database)
- This allows for:
  - Independent configuration if needed in the future
  - Clear separation of concerns
  - Easier debugging (know which app is using which config)

**For Production (Vercel):**
- Set environment variables **separately** in each Vercel project
- Use the **same values** for shared resources (Supabase, email service)
- This provides:
  - Better security isolation
  - Independent deployment cycles
  - Ability to change one app's config without affecting the other

## Shared Environment Variables

Since both apps share the same Supabase database, these **must be identical**:

### Required (Same Values):
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anonymous key
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key (for admin operations)
- `PAYOUT_ENCRYPTION_KEY` - Encryption key for payout accounts (must match for compatibility)
- `ENCRYPTION_KEY` - General encryption key

### Email Service (Same Values):
- `RESEND_API_KEY` or `SMTP_*` variables
- Email addresses (CONTACT_EMAIL, SUPPORT_EMAIL, etc.)

### App-Specific Variables:

**Main App Only:**
- `NEXT_PUBLIC_APP_URL=https://honiccompanystore.com`
- ClickPesa payment gateway variables
- Google Maps API key (if used)

**Admin App Only:**
- `NEXT_PUBLIC_APP_URL=https://siem.honiccompanystore.com`
- Admin-specific configurations

## Quick Setup

1. **Copy from main app:**
   ```bash
   # Copy the .env.local from main app
   cp ../honicstore/.env.local .env.local
   ```

2. **Update app-specific URLs:**
   - Change `NEXT_PUBLIC_APP_URL` to `https://siem.honiccompanystore.com`
   - Change `NEXT_PUBLIC_SITE_URL` to `https://siem.honiccompanystore.com`

3. **Remove unnecessary variables** (optional):
   - ClickPesa variables (unless admin handles payments)
   - Google Maps (unless admin uses maps)
   - Other main-app-specific variables

## Vercel Deployment

When deploying to Vercel:

1. **Main App Project:**
   - Set all environment variables
   - Domain: `honiccompanystore.com`

2. **Admin App Project:**
   - Set the same Supabase and email variables
   - Set admin-specific variables
   - Domain: `siem.honiccompanystore.com`

## Security Notes

- ✅ **DO** share Supabase credentials (same database)
- ✅ **DO** share email service credentials (same email service)
- ✅ **DO** share encryption keys (for data compatibility)
- ❌ **DON'T** share payment gateway keys (unless admin handles payments)
- ❌ **DON'T** commit `.env.local` to git (already in .gitignore)
