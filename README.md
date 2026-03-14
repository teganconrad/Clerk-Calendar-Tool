# Clerk Calendar Tool — Phase 1 (Authentication System)

This phase provides a vanilla HTML/CSS/JS foundation with Supabase authentication and protected page scaffolding.

## Implemented pages
- `index.html` (Home)
- `about.html` (About)
- `contact.html` (Contact)
- `calendar.html` (Protected placeholder for logged-in users)
- `login.html` (Email/password + Google login + forgot-password scaffold)
- `register.html` (Email/password + Google registration)
- `admin.html` (Protected placeholder for admin role)

## Shared structure
- `assets/css/styles.css` — dark/light theme, responsive layout, reusable components
- `assets/js/main.js` — app bootstrap (theme, nav, route guards)
- `assets/js/auth.js` — auth flows, profile checks, nav auth state, logout
- `assets/js/supabase-config.js` — Supabase client setup (place your keys here)

## Supabase setup instructions

### 1) Create a Supabase project
Create or open a Supabase project and copy:
- Project URL
- Public anon key

### 2) Enable auth providers
In **Authentication > Providers**:
- Enable **Email** provider.
- Enable **Google** provider (add your OAuth client ID/secret).

### 3) Configure redirect URLs
In **Authentication > URL Configuration**, add (at minimum):
- `http://localhost:4173/login.html`
- `http://localhost:4173/register.html`
- `http://localhost:4173/calendar.html`

### 4) Create profiles table
Run SQL from:
- `supabase/profiles.sql`

This creates `public.profiles` with:
- `id` (UUID, references `auth.users.id`)
- `email`
- `full_name`
- `role` (`user` or `admin`, default `user`)
- `created_at`

### 5) Add Supabase keys in the app
Open `assets/js/supabase-config.js` and replace:
- `YOUR_SUPABASE_URL`
- `YOUR_SUPABASE_ANON_KEY`

> Comments are included in that file to show exactly where values go.

### 6) Promote an admin user (manual one-time SQL)
After registering a user, run this SQL in Supabase:

```sql
update public.profiles
set role = 'admin'
where email = 'admin@yourdistrict.org';
```

## Auth behavior in this phase
- Logged out:
  - Can access Home/About/Contact/Login/Register.
  - Cannot access Calendar/Admin (redirected to Login).
- Logged in (role=user):
  - Can access Calendar.
  - Cannot access Admin (redirected to Calendar).
- Logged in (role=admin):
  - Can access Calendar and Admin.

## Local development

```bash
python3 -m http.server 4173
```

Open <http://localhost:4173>.
