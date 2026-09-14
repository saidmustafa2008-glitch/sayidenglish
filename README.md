# Sayid English V2.1

Personal English Learning OS for iPad / desktop.

## V2.1 additions
- Listening + shadowing stopwatch and log
- English Journal with prompts, confidence score and word counter
- Automatic vocabulary quiz from saved cards
- Monthly activity calendar (reading/listening/journal)
- Achievements + expanded XP/roadmap system
- Rich book detail modal with per-book minutes, pages, comprehension and vocabulary
- Daily 4-part plan on Today (Read / Review / Listen / Journal)
- Light / dark / system theme
- PWA cache upgraded to V2.1

## Data compatibility
The browser key remains `sayid-english-os-v2`, so existing V2 data is preserved. V1 data is still migrated automatically. Old V1/V2 JSON backups can be imported.

## Run locally
Because this app uses ES modules and a service worker, serve the `dist/` directory over HTTP instead of double-clicking index.html.

```bash
cd dist
python -m http.server 8080
```
Then open `http://localhost:8080`.

## Deploy
Upload the contents of `dist/` to any static host. Your custom domain can point at that host.
