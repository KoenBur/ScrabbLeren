#!/usr/bin/env python3
"""Run the full dependency-free static-site build."""

import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    subprocess.run([sys.executable, str(ROOT / "scripts" / "build-wordlist")], cwd=ROOT, check=True)
    subprocess.run([sys.executable, str(ROOT / "scripts" / "build-site.py")], cwd=ROOT, check=True)


if __name__ == "__main__":
    main()
