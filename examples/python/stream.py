"""Streaming chat completion through Onekey."""

import os
import sys

from openai import OpenAI


def main() -> None:
    base = os.environ.get("GATEWAY_URL", "http://localhost:8000")
    api_key = os.environ["ONEKEY_KEY"]

    client = OpenAI(base_url=f"{base}/v1", api_key=api_key)

    stream = client.chat.completions.create(
        model="onekey-medium",
        messages=[{"role": "user", "content": "Write a haiku about routing."}],
        stream=True,
    )

    for chunk in stream:
        delta = chunk.choices[0].delta.content
        if delta:
            sys.stdout.write(delta)
            sys.stdout.flush()
    print()


if __name__ == "__main__":
    main()
