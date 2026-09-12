"""Zyra — 資料存取

SQLite。整個模組是唯一碰資料庫的地方，日後若要換成 Postgres，
要改的就只有這個檔案。

為什麼是 SQLite：每人一份資料、不做多人協作，沒有跨使用者的 join、
沒有並發寫入競爭，state 就是一個 JSON blob。Postgres 在這裡只帶來
維運成本（多一個要裝、要備份、要調參的服務），換不到任何東西。
備份 = 複製一個檔案。
"""

import json
import sqlite3
from datetime import datetime, timezone

from flask import g

from config import Config

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  google_sub    TEXT    NOT NULL UNIQUE,
  email         TEXT    NOT NULL UNIQUE,
  name          TEXT    NOT NULL DEFAULT '',
  picture       TEXT    NOT NULL DEFAULT '',
  created_at    TEXT    NOT NULL,
  last_login_at TEXT
);

CREATE TABLE IF NOT EXISTS states (
  user_id    INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  version    INTEGER NOT NULL DEFAULT 0,
  data       TEXT    NOT NULL,
  updated_at TEXT    NOT NULL
);
"""


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(Config.DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    # WAL：讀不會被寫擋住。單人使用其實還好，但成本是一行。
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def get() -> sqlite3.Connection:
    if "db" not in g:
        g.db = connect()
    return g.db


def close(_exc=None):
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


def init():
    Config.DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = connect()
    try:
        conn.executescript(SCHEMA)
        conn.commit()
    finally:
        conn.close()


# ---------- 使用者 ----------


def upsert_user(sub: str, email: str, name: str, picture: str) -> dict:
    """以 google_sub 為身分主鍵寫入或更新。

    email 可以被使用者在 Google 端改掉，sub 則永不變。
    白名單比對用 email（人看得懂、好維護），帳號綁定用 sub。
    """
    conn = get()
    ts = now()
    conn.execute(
        """
        INSERT INTO users (google_sub, email, name, picture, created_at, last_login_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(google_sub) DO UPDATE SET
          email = excluded.email,
          name = excluded.name,
          picture = excluded.picture,
          last_login_at = excluded.last_login_at
        """,
        (sub, email, name, picture, ts, ts),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM users WHERE google_sub = ?", (sub,)).fetchone()
    return dict(row)


def get_user(user_id: int):
    row = get().execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    return dict(row) if row else None


# ---------- state ----------


def read_state(user_id: int) -> dict:
    row = get().execute(
        "SELECT version, data, updated_at FROM states WHERE user_id = ?", (user_id,)
    ).fetchone()
    if row is None:
        # 全新使用者：回 null 讓前端走「空狀態」流程，而不是硬塞一份假資料
        return {"version": 0, "data": None, "updatedAt": None}
    return {
        "version": row["version"],
        "data": json.loads(row["data"]),
        "updatedAt": row["updated_at"],
    }


def write_state(user_id: int, expected_version: int, data) -> dict:
    """樂觀鎖寫入。

    版本不符時什麼都不寫，回傳伺服器上的現況讓前端去問使用者。
    沒有這道鎖，「筆電開著、手機也開著」的情境下後存的那台
    會靜默吃掉另一台的變更——而且使用者不會知道。
    """
    conn = get()
    payload = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    if len(payload.encode("utf-8")) > Config.MAX_STATE_BYTES:
        return {"ok": False, "too_large": True}

    ts = now()
    cur = conn.execute(
        "SELECT version FROM states WHERE user_id = ?", (user_id,)
    ).fetchone()

    if cur is None:
        if expected_version != 0:
            return {"ok": False, "conflict": True, **read_state(user_id)}
        conn.execute(
            "INSERT INTO states (user_id, version, data, updated_at) VALUES (?, 1, ?, ?)",
            (user_id, payload, ts),
        )
        conn.commit()
        return {"ok": True, "version": 1, "updatedAt": ts}

    if cur["version"] != expected_version:
        return {"ok": False, "conflict": True, **read_state(user_id)}

    new_version = cur["version"] + 1
    # WHERE 再比一次版本：兩個請求同時通過上面的檢查時，只有一個會真的寫進去。
    updated = conn.execute(
        "UPDATE states SET version = ?, data = ?, updated_at = ? "
        "WHERE user_id = ? AND version = ?",
        (new_version, payload, ts, user_id, expected_version),
    ).rowcount
    conn.commit()

    if updated == 0:
        return {"ok": False, "conflict": True, **read_state(user_id)}
    return {"ok": True, "version": new_version, "updatedAt": ts}
