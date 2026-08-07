# Onekey — Python example

Requires: `pip install openai`

```sh
export ONEKEY_KEY="ok-your-key"
export GATEWAY_URL="http://localhost:8000"
python chat.py
```

```python
"""Chat completion through Onekey using the OpenAI Python SDK."""

import os

from openai import OpenAI

client = OpenAI(
    base_url=os.environ.get("GATEWAY_URL", "http://localhost:8000") + "/v1",
    api_key=os.environ["ONEKEY_KEY"],
)

response = client.chat.completions.create(
    model="onekey-high",  # onekey-low | onekey-medium | onekey-high
    messages=[
        {"role": "user", "content": "Explain quantum tunneling in two sentences."}
    ],
)

print(response.choices[0].message.content)
```
