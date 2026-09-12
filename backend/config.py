"""Zyra — 設定

所有機密一律從環境變數讀取，本檔不含任何預設機密值。
開發時用 backend/.env（已被 .gitignore 排除），正式環境用真正的環境變數。
"""

import os
import secrets
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent
ROOT_DIR = BACKEND_DIR.parent

load_dotenv(BACKEND_DIR / ".env")


def _bool(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in ("1", "true", "yes", "on")


class Config:
    ROOT_DIR = ROOT_DIR
    BACKEND_DIR = BACKEND_DIR

    # --- 機密 ---

    # session cookie 的簽章金鑰。沒設就隨機產生——這在開發時方便，
    # 但每次重啟都會讓所有人被登出，所以正式環境務必明確設定。
    SECRET_KEY = os.environ.get("ZYRA_SECRET_KEY") or secrets.token_hex(32)
    SECRET_KEY_IS_EPHEMERAL = not os.environ.get("ZYRA_SECRET_KEY")

    # Google OAuth 2.0 Client ID（Web application）。
    # 用於驗證 ID token 的 aud——沒有它就無從判斷 token 是不是發給我們的。
    GOOGLE_CLIENT_ID = os.environ.get("ZYRA_GOOGLE_CLIENT_ID", "").strip()

    # 允許登入的 email 白名單，逗號分隔。空的代表誰都不准進來，
    # 這是刻意的：設定漏掉時應該是全部擋下，不是全部放行。
    ALLOWLIST = frozenset(
        e.strip().lower()
        for e in os.environ.get("ZYRA_ALLOWLIST", "").split(",")
        if e.strip()
    )

    # --- 部署 ---

    DB_PATH = Path(os.environ.get("ZYRA_DB_PATH", BACKEND_DIR / "zyra.db"))

    # 正式環境必為 True（cookie 只走 HTTPS）。
    # 開發時 http://localhost 送不出 Secure cookie，所以預設看 ZYRA_ENV。
    ENV = os.environ.get("ZYRA_ENV", "development")
    IS_PROD = ENV == "production"
    SESSION_COOKIE_SECURE = _bool("ZYRA_COOKIE_SECURE", IS_PROD)

    SESSION_COOKIE_HTTPONLY = True

    # 為什麼是 Lax 而不是 Strict：Strict 會讓從外部連結點進來的第一個請求
    # 不帶 cookie，畫面先閃一次登入頁再跳回去，看起來像被登出。
    # 對這種同源 SPA，Lax 的 CSRF 防護已經足夠（再加上 auth.py 的同源檢查）。
    SESSION_COOKIE_SAMESITE = "Lax"

    PERMANENT_SESSION_LIFETIME = int(os.environ.get("ZYRA_SESSION_DAYS", "30")) * 86400

    # 單份 state 的大小上限。防的不是惡意攻擊（登入者都在白名單上），
    # 而是前端出錯送出無限膨脹的資料把磁碟寫爆。
    MAX_STATE_BYTES = int(os.environ.get("ZYRA_MAX_STATE_BYTES", str(8 * 1024 * 1024)))
    MAX_CONTENT_LENGTH = MAX_STATE_BYTES + 64 * 1024


def startup_warnings() -> list:
    """回傳設定上的問題。啟動時印出來，不要讓人上線後才發現白名單是空的。"""
    out = []
    if not Config.GOOGLE_CLIENT_ID:
        out.append("ZYRA_GOOGLE_CLIENT_ID 未設定——沒有人能登入。")
    if not Config.ALLOWLIST:
        out.append("ZYRA_ALLOWLIST 是空的——所有帳號都會被拒絕。")
    if Config.IS_PROD and Config.SECRET_KEY_IS_EPHEMERAL:
        out.append("正式環境未設定 ZYRA_SECRET_KEY——每次重啟都會把所有人登出。")
    if Config.IS_PROD and not Config.SESSION_COOKIE_SECURE:
        out.append("正式環境未啟用 Secure cookie——session 可能在 HTTP 上外洩。")
    return out
