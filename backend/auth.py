"""Zyra — 身分驗證

Google ID token 驗證、白名單、session。
"""

import functools

from flask import jsonify, request, session
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token

import db
from config import Config

_ISSUERS = ("accounts.google.com", "https://accounts.google.com")

# 每次驗證都重新建 Request 會重抓 Google 的公鑰；共用一個才會用到它的快取。
_transport = google_requests.Request()


class AuthError(Exception):
    def __init__(self, message: str, status: int = 401):
        super().__init__(message)
        self.message = message
        self.status = status


def verify_google_credential(credential: str) -> dict:
    """驗證前端送來的 ID token，回傳 Google 的 payload。

    絕對不能只在前端解 JWT 就信——那等於沒有驗證，任何人手工造一個
    JSON 就能登入。下面這行會驗簽章、aud（必須是我們的 Client ID）、
    iss 與 exp，全部由 Google 官方函式庫處理。
    """
    if not Config.GOOGLE_CLIENT_ID:
        raise AuthError("伺服器尚未設定 Google Client ID。", 500)
    if not credential or not isinstance(credential, str):
        raise AuthError("缺少憑證。", 400)

    try:
        info = id_token.verify_oauth2_token(
            credential, _transport, Config.GOOGLE_CLIENT_ID
        )
    except ValueError:
        # 不把 Google 的錯誤訊息原文往外送——那對使用者沒有意義，
        # 對想試探的人倒是有。
        raise AuthError("憑證無效或已過期，請重新登入。", 401)

    if info.get("iss") not in _ISSUERS:
        raise AuthError("憑證來源不正確。", 401)
    if not info.get("email"):
        raise AuthError("這個 Google 帳號沒有可用的 email。", 401)
    if not info.get("email_verified"):
        # 未驗證的 email 可以被冒用，不能拿來比對白名單
        raise AuthError("這個 Google 帳號的 email 尚未驗證。", 401)

    return info


def check_allowlist(email: str):
    if email.lower() not in Config.ALLOWLIST:
        raise AuthError("這個 Google 帳號尚未獲得授權，請聯絡管理者。", 403)


def login(info: dict) -> dict:
    user = db.upsert_user(
        sub=info["sub"],
        email=info["email"],
        name=info.get("name", ""),
        picture=info.get("picture", ""),
    )
    session.clear()
    session["uid"] = user["id"]
    session["sub"] = user["google_sub"]
    session.permanent = True
    return user


def logout():
    session.clear()


def current_user():
    uid = session.get("uid")
    if not uid:
        return None
    user = db.get_user(uid)
    if not user:
        session.clear()
        return None
    # session 還在、但帳號已被移出白名單時，下一個請求就該被擋下來，
    # 不必等 cookie 自然過期。
    if user["email"].lower() not in Config.ALLOWLIST:
        session.clear()
        return None
    return user


def public(user: dict) -> dict:
    return {
        "email": user["email"],
        "name": user["name"],
        "picture": user["picture"],
    }


def same_origin_ok() -> bool:
    """擋跨站偽造請求。

    SameSite=Lax 已經擋掉大部分情境，這裡再補一層：
    有 Origin header 就必須與本站相同。瀏覽器不允許跨站的表單送出
    自訂 Origin，也不允許跨站送出 application/json 而不先 preflight，
    所以這兩道加起來已經足夠，不需要額外的 CSRF token。
    """
    origin = request.headers.get("Origin")
    if origin is None:
        return True  # 同源的 GET／非 CORS 請求不一定帶 Origin
    return origin.rstrip("/") == request.host_url.rstrip("/")


def require_login(fn):
    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        if request.method not in ("GET", "HEAD", "OPTIONS") and not same_origin_ok():
            return jsonify({"error": "請求來源不正確。"}), 403
        user = current_user()
        if not user:
            return jsonify({"error": "尚未登入。"}), 401
        return fn(user, *args, **kwargs)

    return wrapper
