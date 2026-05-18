import json
import sys
from pathlib import Path


def load_keys(path: Path) -> set[str]:
    obj = json.loads(path.read_text(encoding="utf-8"))
    strings = obj.get("strings", {})
    if not isinstance(strings, dict):
        raise ValueError(f"strings must be object: {path}")
    return set(strings.keys())


def main() -> int:
    root = Path(__file__).resolve().parents[1]
    locales_dir = root / "main" / "assets" / "locales"
    if not locales_dir.exists():
        print(f"missing locales dir: {locales_dir}", file=sys.stderr)
        return 2

    locale_files = sorted(locales_dir.glob("*/language.json"))
    if not locale_files:
        print(f"no language.json found under: {locales_dir}", file=sys.stderr)
        return 2

    keys_by_lang: dict[str, set[str]] = {}
    for f in locale_files:
        lang = f.parent.name
        keys_by_lang[lang] = load_keys(f)

    all_langs = sorted(keys_by_lang.keys())
    base_lang = "en-US" if "en-US" in keys_by_lang else all_langs[0]
    base_keys = keys_by_lang[base_lang]

    ok = True
    for lang in all_langs:
        missing = sorted(base_keys - keys_by_lang[lang])
        extra = sorted(keys_by_lang[lang] - base_keys)
        if missing:
            ok = False
            print(f"[{lang}] missing {len(missing)} keys vs {base_lang}")
            for k in missing:
                print(f"  - {k}")
        if extra:
            ok = False
            print(f"[{lang}] extra {len(extra)} keys vs {base_lang}")
            for k in extra:
                print(f"  + {k}")

    if ok:
        print(f"OK: {len(base_keys)} keys; languages={','.join(all_langs)}; base={base_lang}")
        return 0
    return 1


if __name__ == "__main__":
    raise SystemExit(main())

