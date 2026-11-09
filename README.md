# Crush Club

A small Next.js swipe-and-chat game featuring Hades from Disney's *Hercules* and Bob from *Monsters vs. Aliens*.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to play.

Swipe a character card left to pass or right to match. Matches appear in **Chats**, where you can start discussion threads and reply. All matches, threads, and replies are held in browser memory and reset when the page is refreshed.

Character photos can be added under `public/characters/`; set each character's `image` in `app/page.tsx` to its public path (for example, `/characters/hades.jpg`). Until then, the app shows a neutral photo placeholder.

## Checks

```bash
npm run typecheck
npm run lint
npm run build
```
