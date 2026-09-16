# code4you

A zero-dependency, Vercel-ready 100-day coding challenge platform. It uses the supplied challenge dataset and unlocks one problem per day.

## Run locally

```bash
npm run dev
```

Open `http://localhost:3000`.

## Deploy to Vercel

1. Push this folder to a GitHub, GitLab, or Bitbucket repository.
2. In Vercel, select **Add New → Project** and import the repository.
3. Keep the framework preset as **Other**.
4. Leave Build Command and Output Directory empty, then deploy.

You can also install the Vercel CLI and run `vercel` from this folder.

## Choose the unlock schedule

Edit `config.js`:

```js
window.CODE100_CONFIG = {
  cohortStartDate: '2026-10-01',
  platformName: 'code4you',
  communityUrl: ''
};
```

- Leave `cohortStartDate` empty for a personal schedule. Day 1 starts when each visitor first opens the site.
- Set it to a `YYYY-MM-DD` date so everyone follows the same public schedule.

Progress and theme preferences are saved in the visitor's browser with `localStorage`. No database or login is required.

## Production build (optional)

```bash
npm run build
```

This creates a `dist/` copy for static hosting providers that require an output directory. If present, `data/beginner-challenges.json` is included automatically.

## Project structure

- `index.html` — page structure and challenge dialog
- `styles.css` — responsive visual design and dark mode
- `app.js` — unlocking, progress, track switching, and challenge interactions
- `config.js` — platform name and cohort start date
- `data/challenges.json` — the 100 advanced daily challenges
- `data/beginner-challenges.json` — the optional 100 beginner daily challenges
- `vercel.json` — security and cache headers

## Learning tracks

The app includes separate Beginner and Advanced tracks. Each track loads its own JSON file and stores completed challenges independently in the visitor's browser.

The Beginner track expects `data/beginner-challenges.json` to use the same shape as `data/challenges.json`: each item should include `day`, `unit`, `question2.name`, `question2.link`, `question2.difficulty`, `topics`, and optional `solutions.question2` resources.
