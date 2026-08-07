import OpenAI from "openai";
import { NextResponse } from "next/server";

const client = new OpenAI({
  baseURL: `${process.env.GATEWAY_URL ?? "http://localhost:8000"}/v1`,
  apiKey: process.env.ONEKEY_KEY,
});

export async function POST(req: Request) {
  if (!process.env.ONEKEY_KEY) {
    return NextResponse.json(
      { error: "ONEKEY_KEY is not configured" },
      { status: 500 }
    );
  }

  const { prompt } = (await req.json()) as { prompt?: string };
  if (!prompt) {
    return NextResponse.json({ error: "prompt is required" }, { status: 400 });
  }

  const response = await client.chat.completions.create({
    model: "onekey-medium",
    messages: [{ role: "user", content: prompt }],
  });

  return NextResponse.json({
    content: response.choices[0]?.message?.content ?? "",
    model: response.model,
  });
}
