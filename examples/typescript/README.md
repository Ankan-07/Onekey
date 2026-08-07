# Onekey — TypeScript example

```sh
npm install openai
export ONEKEY_KEY="ok-your-key"
export GATEWAY_URL="http://localhost:8000"
npx tsx chat.ts
```

```typescript
import OpenAI from "openai";

const baseURL = `${process.env.GATEWAY_URL ?? "http://localhost:8000"}/v1`;
const apiKey = process.env.ONEKEY_KEY;
if (!apiKey) throw new Error("Set ONEKEY_KEY");

const client = new OpenAI({ baseURL, apiKey });

const response = await client.chat.completions.create({
  model: "onekey-medium",
  messages: [{ role: "user", content: "Draft a launch tweet for an API gateway." }],
});

console.log(response.choices[0]?.message?.content);
```
