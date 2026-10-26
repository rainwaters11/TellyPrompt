# TellyPrompt

A single-file, two-column teleprompter for technical tutorials. Open `index.html` in Chrome or host it as a static page.

## Script format

Use **Edit or paste your script** to paste an array of `{ action, speak }` objects or this readable format:

```text
"Welcome to the tutorial."

[ACTION: Open the editor.]
"I'll start by opening the project."

[ACTION: Run the build.]
"Now let's check the result."
```

Apply the script before presenting. It is saved in that browser for the current site address. A new Vercel address has separate browser storage, so paste the script there once after deployment. **Copy HTML** embeds the current script in a standalone file you can save locally.

## Presenting

- Space: next row; Up Arrow: previous row.
- Right and Left Arrows: next and previous spoken word.
- Voice follow: highlight recognized words and advance after the last words in a row. Speech recognition is a convenience feature; keep the keyboard controls available when recognition misses technical terms or ends after a pause.

Use a top-level Chrome tab for microphone access. Embedded previews may block the microphone. In Chrome's microphone prompt, choose **Allow while visiting the site** to reduce repeated prompts. The app requests microphone access once when voice follow starts and keeps that stream open while listening. It only retries speech recognition automatically when Chrome reports microphone permission as granted, and stops retries after repeated quick failures. Browser speech recognition may still end after pauses or mishear specialized terms.

When voice follow starts, the **Mic** level shows whether the browser is receiving sound, and the status shows the latest words Chrome recognized. If the level stays at zero while speaking, check the selected microphone and operating system permissions. If the level moves but no words appear, the browser's speech service is the failing part; try the top-level HTTPS deployment and keep Space available as a fallback.

## Static hosting

The repository root contains `index.html` and needs no build command or dependencies. To host it on Vercel, import the GitHub repository as a static project and deploy the root directory. Open the resulting HTTPS URL in a top-level Chrome tab. Hosting gives Chrome a stable origin for site permissions; it does not make browser speech recognition perfectly reliable or correct script import errors.
