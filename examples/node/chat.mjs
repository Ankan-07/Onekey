import OpenAI from "openai";

const baseURL = `${process.env.GATEWAY_URL ?? "http://localhost:8000"}/v1`;
const apiKey = process.env.ONEKEY_KEY;
if (!apiKey) throw new Error("Set ONEKEY_KEY");

const client = new OpenAI({ baseURL, apiKey });

const response = await client.chat.completions.create({
  model: "onekey-low",
  messages: [{ role: "user", content: "Reply with exactly: ok" }],
});

console.log(response.choices[0]?.message?.content);
