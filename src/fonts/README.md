# Fonts served by TTMS itself

These are loaded with `next/font/local` from `src/app/layout.tsx` (Rajdhani 700,
the TTMS display face) and `src/components/tasks/themeFonts.ts` (the game-mode
task themes).

They used to come from `next/font/google`, which downloads each face from
Google **during the build**. On Vercel that download failed outright on
2026-10-29 and again on 2026-11-04 — even with the build cache off — and a
failed font fetch fails the whole deploy. Keeping the files here means a build
never reaches out to Google. Do not switch these back.

Each file is the **latin** subset woff2 exactly as Google Fonts served it on
2026-11-04. Files named `-variable` or with a weight range (`400-900`) are
variable fonts covering every weight in one file.

All of them are from Google Fonts and are licensed under the
[SIL Open Font License 1.1](https://openfontlicense.org), which allows bundling
and serving them with an application.

To add a face: download the latin woff2 from Google Fonts' CSS
(`https://fonts.googleapis.com/css2?family=<Name>:wght@<weights>`, requested
with a browser user agent so it answers with woff2), put it here, and load it
with `localFont({ src: ... })`.
