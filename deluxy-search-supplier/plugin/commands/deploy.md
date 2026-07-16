---
description: Pubblica le modifiche dell'app Deluxy (commit + push su main → deploy automatico su Vercel) e verifica che sia live.
---

Pubblica le modifiche correnti dell'app Deluxy.

1. Mostra `git status` e un breve riepilogo delle modifiche.
2. Commit + push sul branch `main` (le credenziali GitHub sono in cache):
   `git add -A && git commit -m "<messaggio chiaro>" && git push origin main`
3. Vercel ricostruisce automaticamente (~1 min). Attendi e verifica che il sito sia live:
   `curl -s -o /dev/null -w "%{http_code}" https://search-deluxy.vercel.app/` (atteso 200)
4. Se hai toccato le API, verifica l'endpoint con un `curl` mirato (con header `x-app-password`).
5. NON serve la CLI Vercel. NON usare node/python in locale (non installati).
