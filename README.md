# Crush Club

A small Next.js swipe-and-chat game featuring Hades from Disney's *Hercules* and Bob from *Monsters vs. Aliens*.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to play.

Swipe a character card left to pass or right to match. Matches appear in **Chats**, where comments are stored in DynamoDB and can be replied to at any depth. Matches and your guest display name are saved in this browser.

## DynamoDB comments

The comments API uses the existing `smash` table by default. It expects:

- Partition key named `comments`, type **String**, with values `hades` or `bob`.
- Sort key named `timestamp`, type **String**.
- Set `COMMENTS_TABLE_NAME` in Amplify if the table has a different name.

The sort key stores a sortable comment timestamp and ID. Guest-vote records share the same table and partition; the API keeps each browser's like/dislike vote and updates comment totals transactionally. Existing table items with a different key schema or non-string sort key need a migration or a matching table before deployment.

The app runs without sign-in: each browser gets a random guest ID and can choose a display name. Guest names and IDs are **not verified**—anyone can impersonate a name or change a guest ID, and clearing browser storage creates a new identity. The write API is public, so add rate limiting or a CAPTCHA before opening it to unrestricted traffic. Add Cognito authentication before treating authorship or one-vote-per-person as secure.

Character photos can be added under `public/characters/`; set each character's `image` in `app/page.tsx` to its public path (for example, `/characters/hades.jpg`). Until then, the app shows a neutral photo placeholder.

## Deploy with AWS Amplify

The root `amplify.yml` installs dependencies from `package-lock.json` with `npm ci --include=dev` before running the production build. Use a Node.js 20 build runtime. Configure the Amplify Gen 1 app for Next.js SSR and assign an SSR compute role that can access the table. Give that role `dynamodb:Query`, `dynamodb:BatchGetItem`, `dynamodb:GetItem`, `dynamodb:PutItem`, and `dynamodb:TransactWriteItems` on the `smash` table. Set `COMMENTS_TABLE_NAME` only if you use another table name; do not put AWS access keys in client-side environment variables. Commit and push these changes, then redeploy. If Amplify's console build settings override `amplify.yml`, make sure they do not skip the dependency-install phase.

## Checks

```bash
npm run typecheck
npm run lint
npm run build
```
