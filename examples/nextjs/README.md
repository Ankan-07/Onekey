# Onekey — Next.js route handler example

A minimal App Router route that proxies a chat request through your self-hosted
gateway. Useful when you want server-side calls without exposing the `ok-` key
to the browser.

## Setup

```sh
# In your Next.js project root
npm install openai
```

Add to `.env.local`:

```env
ONEKEY_KEY=ok-your-key
GATEWAY_URL=http://localhost:8000
```

Copy `route.ts` into `app/api/chat/route.ts`.

## Client usage

```typescript
const res = await fetch("/api/chat", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ prompt: "Summarize Onekey in one line." }),
});
const data = await res.json();
console.log(data.content);
```

**Note:** `ONEKEY_KEY` must not use the `NEXT_PUBLIC_` prefix — keep it
server-only.
