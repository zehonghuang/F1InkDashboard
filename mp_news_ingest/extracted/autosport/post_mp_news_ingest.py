import json
import sys
from urllib.parse import urlencode

import requests


def main() -> int:
    if len(sys.argv) < 3:
        print("用法：python post_mp_news_ingest.py <ingest_json_path> <endpoint> [token]", file=sys.stderr)
        return 2

    ingest_json_path = sys.argv[1]
    endpoint = sys.argv[2]
    token = sys.argv[3] if len(sys.argv) >= 4 and sys.argv[3].strip() else ""

    with open(ingest_json_path, "r", encoding="utf-8") as f:
        payload = json.load(f)

    url = endpoint
    if token:
        url = f"{endpoint}?{urlencode({'token': token})}"

    r = requests.post(url, json=payload, timeout=60)
    print("STATUS", r.status_code)
    print(r.text)
    r.raise_for_status()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

