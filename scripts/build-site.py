#!/usr/bin/env python3
"""Assemble the static GitHub Pages site into dist/."""

from pathlib import Path
import shutil


ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"
REQUIRED_FILES = (
    "index.html",
    "styles.css",
    "app.js",
    "worker.js",
    "sw.js",
    "manifest.webmanifest",
    "icon.svg",
)
REQUIRED_DATA = ("words.txt", "alphagrams.json")
REQUIRED_LICENSES = (
    ROOT / "licenses" / "OPENTAAL-LICENSE.txt",
    ROOT / "licenses" / "OPENTAAL-HUNSPELL-LICENSE.txt",
)


def main() -> None:
    missing = [str(ROOT / name) for name in REQUIRED_FILES]
    missing.extend(str(ROOT / "data" / name) for name in REQUIRED_DATA)
    missing.extend(str(license_file) for license_file in REQUIRED_LICENSES if not license_file.is_file())
    missing = [name for name in missing if not Path(name).is_file()]
    if missing:
        raise SystemExit("Missing build inputs; run scripts/build-wordlist first:\n" + "\n".join(missing))

    DIST.mkdir(exist_ok=True)
    for name in REQUIRED_FILES:
        shutil.copy2(ROOT / name, DIST / name)
    shutil.copytree(ROOT / "data", DIST / "data", dirs_exist_ok=True)
    shutil.copytree(ROOT / "licenses", DIST / "licenses", dirs_exist_ok=True)
    print(f"Static site assembled in {DIST}")


if __name__ == "__main__":
    main()
