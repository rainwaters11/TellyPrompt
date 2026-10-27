# TellyPrompt

A single-file, two-column teleprompter for technical tutorials. Open `index.html` in Chrome or host it as a static page. The optional `stream-proxy/` service provides dedicated live transcription.

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
- Voice follow: highlight recognized words and advance when it hears the first two words of the next row. After a mismatch, it requires two consecutive script words nearby before moving again. Automatic matching stays in the current row and never makes a long recovery jump. Speech recognition is a convenience feature; keep the keyboard controls available when recognition misses technical terms or ends after a pause.
- The full-width control bar stays at the bottom during recording. If the highlight gets stuck, speak a few words from your current place and click **Find my place**. It searches nearby script text for Chrome's latest recognized phrase and continues the same listening session. **Forward 5 words**, **Previous step**, and **Next step** work without recognition. You can also click any spoken word to sync there, or use the arrow keys and Space.

Use a top-level Chrome tab for microphone access. Embedded previews may block the microphone. In Chrome's microphone prompt, choose **Allow while visiting the site** to reduce repeated prompts. The app requests microphone access once when voice follow starts and keeps that stream open while listening. If Chrome's network speech service disconnects, the app retains that stream and its script position, then retries with increasing delays while permission remains granted. Other repeated quick failures stop automatic retries to avoid permission popups. Browser speech recognition may still end after pauses or mishear specialized terms.

On supported Chrome versions, **Try on-device speech** checks for an English language pack and installs it when Chrome offers a download. Once available, the app uses it without relying on Chrome's remote speech service. It also selects an already installed pack automatically. This uses Chrome's built-in speech API and needs no API key. If the pack is unavailable and the remote service remains unreachable, voice follow cannot receive words; the step controls remain available.

When voice follow starts, the **Mic** level shows whether the browser is receiving sound, and the status shows the latest words Chrome recognized. If the level stays at zero while speaking, check the selected microphone and operating system permissions. If the level moves but no words appear, the browser's speech service is the failing part; try the top-level HTTPS deployment and keep Space available as a fallback.

Build 1.8 keeps its match position when Chrome replaces or shortens a recognition transcript. It also limits automatic matching to nearby words; use **Find my place** for a deliberate longer jump. If Chrome returns no new words for ten seconds, the control bar says so; compare that message with the Mic level to distinguish a speech-service pause from a script-matching problem. If Chrome ends recognition while this tab is hidden, the app waits and resumes when the tab becomes visible again while retaining its microphone stream.

## Dedicated streaming transcription (Deepgram + Railway)

The frontend remains on Vercel. Railway runs the WebSocket proxy in `stream-proxy/`, which holds your Deepgram API key. The browser sends microphone audio to Railway and receives transcript text. The provider key never goes into the HTML or browser storage. This uses two paid or metered services; check their current pricing before recording.

1. In the [Deepgram Console](https://console.deepgram.com/), create a project and an API key authorized for live speech recognition. Copy it privately. Do not paste it into this repository or the teleprompter page.
2. Generate a separate access code. On Linux, run `openssl rand -hex 24` and save the 48-character output. This is the code you will enter into the teleprompter. It is not your Deepgram API key.
3. In [Railway](https://railway.com/), create a project, choose **Deploy from GitHub repo**, and select `rainwaters11/TellyPrompt`. Set the service **Root Directory** to `/stream-proxy`. Railway should install dependencies with `npm ci` and run `npm start` (Node 20 or newer). Do not set `PORT`; Railway provides it.
4. In Railway's service **Variables**, set:

   ```text
   DEEPGRAM_API_KEY=your Deepgram API key
   TELLYPROMPT_ACCESS_CODE=the 48-character code from step 2
   ALLOWED_ORIGIN=https://tellyprompt-git-main-mistys-projects-9d6f5198.vercel.app
   ```

   `ALLOWED_ORIGIN` must match the exact address shown in your teleprompter's browser tab, without a trailing slash. If you later use another Vercel domain, update this variable and redeploy the Railway service.
5. Deploy the Railway service and generate a **Public Domain** in its **Networking** settings. Open `https://YOUR-RAILWAY-DOMAIN/health`; it should respond with `{"ok":true}`. The `/transcribe` route accepts WebSocket connections only from your allowed site with the access code.
6. Open the latest Vercel teleprompter (**Build 1.8**), expand **Streaming transcription setup**, and enter `wss://YOUR-RAILWAY-DOMAIN/transcribe` plus the access code from step 2. Click **Use streaming transcription**, apply your script, then click **Start voice follow**. The bottom status should say **Listening through streaming transcription** and then show the words it hears.

The app saves the proxy URL in local browser storage and the access code only for the current browser tab. If you open a new tab, enter the code again. **Use browser speech** in the setup section switches back to Chrome's built-in option on the next voice-follow start. The page retains the microphone stream and retries the streaming connection after a temporary disconnect. During an outage, you can use the step controls without restarting the page.

## Static hosting

The repository root contains `index.html` and needs no build command or dependencies for Vercel. Keep the Vercel project root at the repository root; only the separate Railway service uses `stream-proxy` as its root. Open the resulting HTTPS URL in a top-level Chrome tab. Hosting gives Chrome a stable origin for site permissions; it does not make browser speech recognition perfectly reliable or correct script import errors.

Use the project's production domain from Vercel's **Domains** page for ongoing testing. A URL with a generated deployment identifier points to one specific build and will not update after later GitHub pushes. Check the visible build label in the control bar after each deployment.
