#!/usr/bin/env python3
"""Shower booking script - no jq dependency."""

import json
import time
import sys
from datetime import datetime
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import URLError

ROOT_DIR = Path(__file__).resolve().parent.parent
CONF_FILE = ROOT_DIR / "conf" / "accounts.env"
LOG_DIR = ROOT_DIR / "logs"
TOKEN_CACHE = LOG_DIR / "tokens.json"
RUN_LOG = LOG_DIR / "book.log"


def log(msg):
    now = datetime.now().strftime("%F %T")
    line = f"[{now}] {msg}"
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    with open(RUN_LOG, "a") as f:
        f.write(line + "\n")
    print(line, flush=True)


def load_conf():
    cfg = {}
    with open(CONF_FILE) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" in line:
                k, v = line.split("=", 1)
                cfg[k.strip()] = v.strip().strip('"').strip("'")
    return cfg


def http_post(url, headers, data=b"{}"):
    req = Request(url, data=data, headers=headers, method="POST")
    with urlopen(req, timeout=15) as resp:
        return json.loads(resp.read().decode("utf-8"))


def load_token_cache():
    if TOKEN_CACHE.exists():
        with open(TOKEN_CACHE) as f:
            return json.load(f)
    return {}


def save_token_cache(cache):
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    with open(TOKEN_CACHE, "w") as f:
        json.dump(cache, f, indent=2)


def login(code, password_md5, base_url, cache):
    url = f"{base_url}/api/logon/login?time={int(time.time() * 1000)}"
    headers = {"Content-Type": "application/json"}
    body = json.dumps({"code": code, "password": password_md5}).encode()
    resp = http_post(url, headers, body)

    if resp.get("code") != 200 or not resp.get("data", {}).get("token"):
        log(f"login failed: account={code} response={json.dumps(resp)}")
        return False

    cache[code] = {
        "loginid": str(resp["data"]["loginid"]),
        "token": resp["data"]["token"],
    }
    save_token_cache(cache)
    log(f"login refreshed for {code}")
    return True


def ensure_session(code, password_md5, base_url, cache, cfg):
    # If we already have a cached token, use it
    if code in cache and cache[code].get("token") and cache[code].get("loginid"):
        return True
    # If loginid is in config, seed cache before login
    config_loginid = cfg.get(f"LOGINID_{code}")
    if config_loginid:
        if code not in cache:
            cache[code] = {}
        cache[code]["loginid"] = config_loginid
    return login(code, password_md5, base_url, cache)


def post_with_auth(code, url, cache):
    entry = cache.get(code, {})
    headers = {
        "token": entry.get("token", ""),
        "loginid": entry.get("loginid", ""),
        "Content-Type": "application/json",
    }
    return http_post(url, headers)


def authed_post_retry(code, url, password_md5, base_url, cache, cfg):
    ensure_session(code, password_md5, base_url, cache, cfg)
    try:
        resp = post_with_auth(code, url, cache)
        if resp.get("code") == 200:
            return resp
    except Exception:
        pass

    login(code, password_md5, base_url, cache)
    try:
        resp = post_with_auth(code, url, cache)
        if resp.get("code") != 200:
            log(f"request failed after relogin: account={code} url={url}")
            return None
        return resp
    except Exception as e:
        log(f"request failed after relogin: account={code} url={url} error={e}")
        return None


def collect_slots(cfg):
    slot_ids = cfg["SLOT_IDS"].split(",")
    return [{"id": int(sid.strip()), "period": "", "remain": 0} for sid in slot_ids]


def book_slot(code, slot, cfg, password_md5, base_url, cache):
    slot_id = slot["id"]
    url = f"{base_url}/api/bathRoom/bookOrder?bookstatusid={slot_id}&time={int(time.time() * 1000)}"
    resp = authed_post_retry(code, url, password_md5, base_url, cache, cfg)
    if not resp:
        return False

    succeed = resp.get("data", {}).get("succeed", "")
    message = resp.get("message", "")

    if succeed == "Y":
        order_no = ""
        bol = resp.get("data", {}).get("bookOrderList", [])
        if bol:
            order_no = bol[0].get("orderNo", "")
        log(f"booked: account={code} slot_id={slot_id} order_no={order_no or 'unknown'}")
        return True

    log(f"booking rejected: account={code} slot_id={slot_id} succeed={succeed} message={message}")
    return False


def main():
    if not CONF_FILE.exists():
        print(f"Missing config: {CONF_FILE}", file=sys.stderr)
        sys.exit(1)

    cfg = load_conf()
    password_md5 = cfg["PASSWORD_MD5"]
    base_url = cfg["BASE_URL"]
    accounts = cfg["ACCOUNTS"].split(",")

    cache = load_token_cache()
    slots = collect_slots(cfg)

    log(f"booking {len(slots)} slot IDs {cfg['SLOT_IDS']} for bathroom {cfg['BATHROOM_ID']}")

    account_count = len(accounts)
    for i, slot in enumerate(slots):
        code = accounts[i % account_count]
        log(f"assigning: account={code} slot_id={slot['id']}")
        book_slot(code, slot, cfg, password_md5, base_url, cache)


if __name__ == "__main__":
    main()
