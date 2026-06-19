#!/usr/bin/env python3
"""Diagnose a pm2 process crashloop. Usage: python3 scripts/diagnose_crashloop.py <name>"""
from __future__ import annotations

import collections
import os
import re
import subprocess
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPORT_DIR = os.path.join(ROOT, "autopilot", "reports")


def _err_log(name: str) -> str:
    try:
        r = subprocess.run(["pm2", "logs", name, "--err", "--nostream",
                             "--lines", "200", "--raw"],
                            capture_output=True, text=True, timeout=20)
        return r.stdout or ""
    except (subprocess.SubprocessError, OSError) as exc:
        return f"PM2_ERR: {exc}"


_TRACEBACK_RE = re.compile(r"(\w+(?:Error|Exception)): (.{0,160})")


def diagnose(name: str) -> dict:
    log = _err_log(name)
    lines = log.splitlines()
    signatures = collections.Counter()
    for line in lines:
        m = _TRACEBACK_RE.search(line)
        if m:
            signatures[(m.group(1), m.group(2)[:80])] += 1
    most_common = signatures.most_common(5)
    return {"name": name, "lines_scanned": len(lines),
            "top_signatures": most_common, "tail": lines[-30:]}


def write_report(diag: dict) -> str:
    os.makedirs(REPORT_DIR, exist_ok=True)
    ts = int(time.time())
    path = os.path.join(REPORT_DIR, f"crashloop-{diag['name']}-{ts}.md")
    md = [f"# Crashloop diagnosis — `{diag['name']}` ({ts})", ""]
    md.append(f"Lines scanned: {diag['lines_scanned']}")
    md.append("")
    md.append("## Top error signatures")
    if not diag["top_signatures"]:
        md.append("- (none found)")
    for (ex, msg), n in diag["top_signatures"]:
        md.append(f"- `{ex}` × {n}: {msg}")
    md.append("")
    md.append("## Last 30 lines")
    md.append("```")
    md += diag["tail"]
    md.append("```")
    with open(path, "w") as fh:
        fh.write("\n".join(md) + "\n")
    return path


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: diagnose_crashloop.py <pm2-name>", file=sys.stderr)
        return 2
    diag = diagnose(sys.argv[1])
    path = write_report(diag)
    print(f"wrote: {path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
