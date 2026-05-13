#!/usr/bin/env python3
"""
Server-side writer for conf/accounts.env (listen on loopback; use Nginx in front).

  Recommended: POST JSON merge (no full file in browser, no secret in JS)
    POST /merge-accounts-env  or  /api/merge-accounts-env
    Header: X-Shower-Internal: 1   (set ONLY by Nginx via proxy_set_header, not trusted from the public Internet)
    Body: {"accounts":[{"code":"2530090187","loginid":"59263"}, ...]}

  Optional legacy: full file + Bearer (for scripts / break-glass)
    POST /save  or  /api/save-accounts-env
    Requires SHOWER_CONF_WRITE_TOKEN

  Environment:
    SHOWER_ACCOUNTS_ENV_PATH   Required. Absolute path to accounts.env
    SHOWER_BIND                Default 127.0.0.1:8765
    SHOWER_CONF_WRITE_TOKEN    Optional; if set, enables /save Bearer uploads
    SHOWER_CONF_SAVE_CORS_ORIGIN  Optional CORS (see previous docs)
    SHOWER_REQUIRE_INTERNAL_HEADER  Default 1; set 0 only for local debugging (insecure)

  Nginx example: auth_basic + proxy_set_header X-Shower-Internal 1;  -> proxy_pass 127.0.0.1:8765
"""

from __future__ import annotations

import json
import os
import re
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from typing import Any, Optional
from urllib.parse import urlparse


MAX_SAVE_BYTES = 65536
MAX_MERGE_BYTES = 32768

ORDER_FIRST = (
    "ACCOUNT_PREFIX",
    "PASSWORD_MD5",
    "BASE_URL",
    "BATHROOM_ID",
    "SLOT_IDS",
    "ACCOUNTS",
)


def _cors_origin() -> Optional[str]:
    v = os.environ.get("SHOWER_CONF_SAVE_CORS_ORIGIN", "").strip()
    return v or None


def _require_internal() -> bool:
    return os.environ.get("SHOWER_REQUIRE_INTERNAL_HEADER", "1").strip() != "0"


def parse_env_file(path: Path) -> dict[str, str]:
    cfg: dict[str, str] = {}
    if not path.exists():
        return cfg
    for line in path.read_text(encoding="utf-8").splitlines():
        s = line.strip()
        if not s or s.startswith("#") or "=" not in s:
            continue
        k, v = s.split("=", 1)
        cfg[k.strip()] = v.strip()
    return cfg


def write_env_atomic(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(text, encoding="utf-8", newline="\n")
    tmp.replace(path)


def render_env_text(cfg: dict[str, str]) -> str:
    lines: list[str] = []
    used: set[str] = set()
    for key in ORDER_FIRST:
        if key in cfg:
            lines.append(f"{key}={cfg[key]}")
            used.add(key)
    others = sorted(k for k in cfg if k not in used and not k.startswith("LOGINID_"))
    for k in others:
        lines.append(f"{k}={cfg[k]}")
        used.add(k)
    for k in sorted(kk for kk in cfg if kk.startswith("LOGINID_")):
        lines.append(f"{k}={cfg[k]}")
        used.add(k)
    for k in sorted(x for x in cfg if x not in used):
        lines.append(f"{k}={cfg[k]}")
    return "\n".join(lines) + "\n"


def merge_accounts_into_cfg(cfg: dict[str, str], accounts: list[dict[str, Any]]) -> None:
    if not isinstance(accounts, list) or len(accounts) > 32:
        raise ValueError("accounts must be a list of length 1..32")

    rows: list[tuple[str, str]] = []
    for a in accounts:
        if not isinstance(a, dict):
            raise ValueError("bad account row")
        code = str(a.get("code", "")).strip()
        loginid = str(a.get("loginid", "")).strip()
        if not code:
            continue
        if not re.match(r"^\d{10,15}$", code):
            raise ValueError(f"invalid code: {code}")
        if loginid and not re.match(r"^\d{1,12}$", loginid):
            raise ValueError(f"invalid loginid for {code}")
        rows.append((code, loginid))

    if not rows:
        raise ValueError("no accounts")

    if "PASSWORD_MD5" not in cfg or "BASE_URL" not in cfg:
        raise ValueError("accounts.env missing required keys (PASSWORD_MD5 / BASE_URL); create file first")

    codes = [c for c, _ in rows]
    for k in list(cfg.keys()):
        if k.startswith("LOGINID_"):
            suffix = k[len("LOGINID_") :]
            if suffix not in codes:
                del cfg[k]

    for code, loginid in rows:
        if loginid:
            cfg[f"LOGINID_{code}"] = loginid
        elif f"LOGINID_{code}" in cfg:
            del cfg[f"LOGINID_{code}"]

    cfg["ACCOUNTS"] = ",".join(codes)


class Handler(BaseHTTPRequestHandler):
    server_version = "save_accounts_conf/2.0"

    def log_message(self, fmt: str, *args) -> None:
        sys.stderr.write("%s - - [%s] %s\n" % (self.address_string(), self.log_date_time_string(), fmt % args))

    def _send(self, code: int, body: bytes = b"", ctype: str = "text/plain; charset=utf-8") -> None:
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        co = _cors_origin()
        if co:
            self.send_header("Access-Control-Allow-Origin", co)
            self.send_header("Vary", "Origin")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if body:
            self.wfile.write(body)

    def _internal_ok(self) -> bool:
        if not _require_internal():
            return True
        return self.headers.get("X-Shower-Internal", "").strip() == "1"

    def do_OPTIONS(self) -> None:
        if not _cors_origin():
            self.send_error(404)
            return
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", _cors_origin() or "")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header(
            "Access-Control-Allow-Headers",
            "Authorization, Content-Type, X-Shower-Internal",
        )
        self.send_header("Access-Control-Max-Age", "86400")
        self.end_headers()

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path in ("/health", "/"):
            self._send(200, b"ok\n")
            return
        self.send_error(404)

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path

        if path in ("/merge-accounts-env", "/api/merge-accounts-env"):
            self._handle_merge()
            return
        if path in ("/save", "/api/save-accounts-env"):
            self._handle_save()
            return
        self.send_error(404)

    def _handle_merge(self) -> None:
        env_path = os.environ.get("SHOWER_ACCOUNTS_ENV_PATH", "").strip()
        if not env_path:
            self._send(500, b"missing SHOWER_ACCOUNTS_ENV_PATH\n")
            return
        p = Path(env_path)
        if not p.exists():
            self._send(400, b"accounts.env does not exist yet; create it once on the server\n")
            return
        if not self._internal_ok():
            self._send(403, b"missing trusted proxy (X-Shower-Internal). Configure Nginx proxy_set_header.\n")
            return

        length = int(self.headers.get("Content-Length", "0"))
        if length <= 0 or length > MAX_MERGE_BYTES:
            self._send(413, b"body too large or empty\n")
            return
        raw = self.rfile.read(length)
        try:
            payload = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            self._send(400, b"invalid json\n")
            return

        accounts = payload.get("accounts")
        try:
            cfg = parse_env_file(p)
            merge_accounts_into_cfg(cfg, accounts)
            write_env_atomic(p, render_env_text(cfg))
        except ValueError as e:
            self._send(400, (str(e) + "\n").encode("utf-8"))
            return

        body = b"merged\n"
        self.send_response(200)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        co = _cors_origin()
        if co:
            self.send_header("Access-Control-Allow-Origin", co)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _handle_save(self) -> None:
        token = os.environ.get("SHOWER_CONF_WRITE_TOKEN", "").strip()
        env_path = os.environ.get("SHOWER_ACCOUNTS_ENV_PATH", "").strip()
        if not token or not env_path:
            self._send(503, b"full-file save disabled (set SHOWER_CONF_WRITE_TOKEN to enable)\n")
            return

        auth = self.headers.get("Authorization", "")
        prefix = "Bearer "
        if not auth.startswith(prefix) or auth[len(prefix) :].strip() != token:
            self._send(401, b"unauthorized\n")
            return

        length = int(self.headers.get("Content-Length", "0"))
        if length <= 0 or length > MAX_SAVE_BYTES:
            self._send(413, b"body too large or empty\n")
            return

        raw = self.rfile.read(length)
        try:
            text = raw.decode("utf-8")
        except UnicodeDecodeError:
            self._send(400, b"invalid utf-8\n")
            return

        if "ACCOUNTS=" not in text or "PASSWORD_MD5=" not in text:
            self._send(400, b"body does not look like accounts.env\n")
            return

        path = Path(env_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(path.suffix + ".tmp")
        tmp.write_text(text, encoding="utf-8", newline="\n")
        tmp.replace(path)

        body = b"saved\n"
        self.send_response(200)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        co = _cors_origin()
        if co:
            self.send_header("Access-Control-Allow-Origin", co)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def main() -> None:
    bind = os.environ.get("SHOWER_BIND", "127.0.0.1:8765").strip()
    host, _, port_s = bind.partition(":")
    port = int(port_s or "8765")
    httpd = HTTPServer((host, port), Handler)
    sys.stderr.write("save_accounts_conf_server listening on http://%s:%s\n" % (host, port))
    httpd.serve_forever()


if __name__ == "__main__":
    main()
