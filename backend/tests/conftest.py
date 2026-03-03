from __future__ import annotations

import os


# Keep tests independent from local .env secrets and avoid live LLM calls.
os.environ["OPENAI_API_KEY"] = ""
