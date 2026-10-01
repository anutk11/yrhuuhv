# Welcome to your Lovable project

## Project info

**URL**: https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/features/custom-domain#custom-domain)


## New Supabase setup

The application is designed to work with a fresh Supabase project. The repository contains the database migrations under `supabase/migrations`, including RLS policies, private/central question banks, room gameplay, phone + Google participation, realtime answer events, and durable game-history snapshots.

After creating a Supabase project:

1. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in the application's environment.
2. Apply all migrations with the Supabase CLI using `supabase db push` after linking the project.
3. Deploy the Edge Functions under `supabase/functions`.
4. Configure the required Edge Function secrets, including `YEMOT_WEBHOOK_TOKEN` and any AI provider key used by `generate-questions`.

### Bootstrap the first administrator

New signups receive the `user` role by default. To make the first account an administrator, run this in the Supabase SQL editor after that account has signed up:

```sql
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::public.app_role
FROM auth.users
WHERE email = 'YOUR_EMAIL_HERE'
ON CONFLICT (user_id, role) DO NOTHING;
```

The administrator can then manage roles from **ניהול מערכת**.

### Data model

- **Private question bank**: owned by one user and protected by RLS.
- **Central question bank**: visible to authenticated users and editable only by administrators.
- **Game questions**: copied into the room as independent rows and never mutate the source bank question.
- **Game history snapshots**: preserve participants, questions, and answers exactly as they were when the game finished.
- **Game templates**: owned by the creator.
- **Question media**: uploads are scoped to the owning user's storage path for personal assets.
- **Audit log**: records question-bank changes for administrator review.

### User experience

Authenticated users can create games, invite Google players, use the central bank, manage their private bank, generate questions with AI, and view their own game history. Administrators additionally manage the central bank, user roles, phone roster, and audit log.
## Production hardening notes

The production database is intentionally not identified in `supabase/config.toml`. Link the repository to the new Supabase project with `supabase link --project-ref <project-ref>`.

The Yemot webhook fails closed unless the `YEMOT_WEBHOOK_TOKEN` Supabase secret is configured. Prefer sending it in the `x-yemot-token` header; the query-string fallback is retained only for Yemot deployments that cannot send custom headers.

Game phase changes are server-driven by `tick_rooms()` and private Realtime Broadcast channels. Clients use a 30-second safety resync rather than polling every few seconds.

The synthetic phone user id still uses the last 12 phone digits for backward-compatible roster mapping. This collision risk is documented intentionally and is not changed until a roster-compatible migration is available.

For scale testing, use `scripts/loadtest/quiz.js` with k6. Supply test access tokens through environment variables only; never commit tokens.
