# System 2026 — życie poza pracą

Tracker tygodniowego minimum, wagi, odblokowań zakupowych, funduszy i biblioteki
(figurki / książki / manga / modele / filmy). PWA — instaluje się na telefonie
i działa offline. Dane w localStorage przeglądarki + eksport/import JSON.

Odpowiednik dokumentu `plan-zycie-poza-praca-2026.md` w kodzie:
sezon 13.07–31.12.2026, 24 tygodnie, waga 115 → <100 kg, bonusy 100 zł/tydzień
i 200 zł/kg, odblokowania (sprzęt 8 tygodni, figurki 5, książki 1:1→2:1, rower <100 kg).

## Uruchomienie lokalne

```bash
npm install
npm run dev
```

Do synchronizacji w chmurze potrzebny jest plik `.env.local` (niecommitowany) z:
```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```
Wartości z panelu Supabase → Settings → API danego projektu.

## Deploy (najprościej: Vercel)

1. Wypchnij repo na GitHub:
   ```bash
   git remote add origin git@github.com:TWOJ_LOGIN/system-2026.git
   git push -u origin main
   ```
2. vercel.com → Add New Project → import repo → Deploy (zero konfiguracji, Vite wykrywany automatycznie).
3. Dostajesz URL typu `system-2026.vercel.app`.

Alternatywy: Netlify (tak samo), GitHub Pages (build `npm run build`, deploy folderu `dist/` — `base: "./"` w vite.config już to obsługuje).

## Instalacja na telefonie

Android (Chrome): otwórz URL → menu ⋮ → **Dodaj do ekranu głównego** → otwiera się jak natywna aplikacja, działa offline.
iOS (Safari): udostępnij → **Dodaj do ekranu początkowego**.

## Dane

- Aplikacja wymaga logowania (email + hasło, Supabase Auth) i synchronizuje dane
  automatycznie między urządzeniami — zmiana na telefonie pojawia się na innych
  zalogowanych urządzeniach niemal od razu (realtime), a przy braku sieci apka
  dalej działa offline na lokalnej kopii i dogania się po powrocie połączenia.
- Lokalnie dane trzymane są też w `localStorage` pod kluczem `system-2026-v1`
  (kopia offline/fallback), a w chmurze w tabeli Supabase `user_data`.
- Backup: zakładka **Fundusze → Dane → Eksport JSON**. Rób przy poniedziałkowym check-inie.
- Przeniesienie na inne urządzenie: wystarczy zalogować się tym samym kontem —
  eksport/import JSON zostaje jako dodatkowy pełny backup "na wszelki wypadek".

## Struktura

```
src/App.jsx    — cała aplikacja (zakładki: Tydzień, Waga, Cele, Fundusze, Biblioteka)
src/main.jsx   — bootstrap + rejestracja service workera
public/sw.js   — offline (network-first z cache fallback)
public/manifest.webmanifest, icon-*.png — PWA
```

## Pomysły na rozwój (backlog, time-box 2h/tydz z puli „rozwój")

- wykres wagi (średnie tygodniowe + linia trendu do 100 kg)
- edycja pozycji biblioteki (notatki, zmiana typu)
- import biblioteki z CSV (masowe zasilenie figurkami)
- eksport tygodnia w formacie check-inu (gotowy tekst do wklejenia w poniedziałek)
- synchronizacja między urządzeniami (np. plik w chmurze zamiast localStorage)
