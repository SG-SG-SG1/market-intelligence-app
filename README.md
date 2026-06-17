# Market Intel — 100% Free Forever

A portfolio-aware market news app. No API key. No login. No recurring cost. Ever.

## How it works

This app fetches real news headlines from **Yahoo Finance RSS feeds** through a small
server-side function (`/api/news.js`). Running the fetch on the server (instead of
directly from your browser) avoids the CORS/security blocks that stop direct RSS
fetching from working in-browser.

## Deploy to Vercel (free, ~5 minutes)

1. Create a free GitHub account at github.com/signup (skip if you have one)
2. Create a new repository, upload ALL the files in this folder (keep the same folder structure — `api/news.js` must stay inside an `api` folder)
3. Go to vercel.com/signup → "Continue with GitHub"
4. Click "Add New" → "Project" → select your repository → "Deploy"
5. Wait ~60 seconds. You'll get a live link like `your-app-name.vercel.app`

No environment variables needed. No API key needed. That's it.

## Use it on your phone

1. Open your Vercel link in Chrome (Android) or Safari (iPhone)
2. Tap the Share/menu button → "Add to Home Screen"
3. It now behaves like a real app icon — full screen, no browser bar

## Use it on your computer

Just bookmark the Vercel link. Open anytime.

## Local development (optional, only if you want to test before deploying)

```
npm install
npm run dev
```

Note: the `/api/news` endpoint only works when deployed to Vercel (or run via
`vercel dev`), since it's a serverless function — it won't work with plain `npm run dev`
alone for the news fetching part, though the UI will still load.

## Updating your portfolio

Open the app → tap "Portfolio" tab → tap "Edit" → add or remove any ticker.
Changes apply immediately on your next Refresh.

## Cost

$0. Forever. Yahoo Finance RSS is public and free. Vercel's free tier comfortably
covers personal use of this app (well under any usage limits for a single user).
