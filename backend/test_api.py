"""Zyra 後端測試

只用標準函式庫的 unittest，不引入 pytest——測試不該比被測的東西還重。

    cd backend
    python -m unittest test_api -v

Google 的簽章驗證由 google-auth 負責，這裡把 verify_oauth2_token 換成假的。
要測的是「我們自己寫的那一半」：白名單、session、樂觀鎖、同源檢查、
以及不能對外開放的路徑真的沒開。
"""

import json
import os
import tempfile
import unittest
from pathlib import Path

os.environ.setdefault("ZYRA_SECRET_KEY", "test-secret-not-for-production")
os.environ.setdefault("ZYRA_GOOGLE_CLIENT_ID", "test-client-id.apps.googleusercontent.com")
os.environ.setdefault("ZYRA_ALLOWLIST", "allowed@example.com, Other@Example.com")
os.environ["ZYRA_DB_PATH"] = str(Path(tempfile.mkdtemp()) / "test.db")

import app as app_module  # noqa: E402
import auth as auth_module  # noqa: E402
import db as db_module  # noqa: E402

TOKENS = {
    "good": {
        "iss": "https://accounts.google.com",
        "sub": "sub-1",
        "email": "allowed@example.com",
        "email_verified": True,
        "name": "君和",
        "picture": "",
    },
    "not-allowed": {
        "iss": "https://accounts.google.com",
        "sub": "sub-2",
        "email": "stranger@example.com",
        "email_verified": True,
        "name": "路人",
        "picture": "",
    },
    "unverified": {
        "iss": "https://accounts.google.com",
        "sub": "sub-3",
        "email": "allowed@example.com",
        "email_verified": False,
        "name": "",
        "picture": "",
    },
    "wrong-issuer": {
        "iss": "https://evil.example.com",
        "sub": "sub-4",
        "email": "allowed@example.com",
        "email_verified": True,
        "name": "",
        "picture": "",
    },
}


def fake_verify(credential, transport, client_id):
    if credential not in TOKENS:
        raise ValueError("bad token")
    return TOKENS[credential]


class Base(unittest.TestCase):
    def setUp(self):
        auth_module.id_token.verify_oauth2_token = fake_verify
        self.app = app_module.application
        self.app.config["TESTING"] = True
        self.c = self.app.test_client()

        # 每個測試從空資料庫開始。共用一份的話，測試會依執行順序而
        # 時好時壞——那種測試比沒有測試更糟。
        conn = db_module.connect()
        try:
            conn.execute("DELETE FROM states")
            conn.execute("DELETE FROM users")
            conn.commit()
        finally:
            conn.close()

    def login(self, token="good"):
        return self.c.post("/api/auth/google", json={"credential": token})


class TestAuth(Base):
    def test_allowed_account_can_log_in(self):
        r = self.login()
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.get_json()["user"]["email"], "allowed@example.com")

    def test_account_outside_allowlist_gets_403_not_401(self):
        # 403 與 401 對使用者是兩件完全不同的事：
        # 「你沒被授權」vs「你沒登入成功」。講錯會讓人一直重試。
        r = self.login("not-allowed")
        self.assertEqual(r.status_code, 403)

    def test_allowlist_is_case_insensitive(self):
        TOKENS["mixed"] = dict(TOKENS["good"], sub="sub-9", email="OTHER@example.com")
        self.assertEqual(self.login("mixed").status_code, 200)

    def test_unverified_email_rejected(self):
        self.assertEqual(self.login("unverified").status_code, 401)

    def test_wrong_issuer_rejected(self):
        self.assertEqual(self.login("wrong-issuer").status_code, 401)

    def test_garbage_credential_rejected(self):
        self.assertEqual(self.login("not-a-real-token").status_code, 401)

    def test_me_requires_login(self):
        self.assertEqual(self.c.get("/api/me").status_code, 401)

    def test_logout_clears_session(self):
        self.login()
        self.assertEqual(self.c.get("/api/me").status_code, 200)
        self.c.post("/api/auth/logout")
        self.assertEqual(self.c.get("/api/me").status_code, 401)

    def test_cross_origin_post_is_rejected(self):
        self.login()
        r = self.c.put(
            "/api/state",
            json={"version": 0, "data": {}},
            headers={"Origin": "https://evil.example.com"},
        )
        self.assertEqual(r.status_code, 403)


class TestState(Base):
    def setUp(self):
        super().setUp()
        self.login()

    def test_new_user_has_no_data(self):
        body = self.c.get("/api/state").get_json()
        self.assertIsNone(body["data"])
        self.assertEqual(body["version"], 0)

    def test_write_then_read(self):
        r = self.c.put("/api/state", json={"version": 0, "data": {"cards": [1, 2]}})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.get_json()["version"], 1)

        body = self.c.get("/api/state").get_json()
        self.assertEqual(body["data"], {"cards": [1, 2]})
        self.assertEqual(body["version"], 1)

    def test_version_increments(self):
        self.c.put("/api/state", json={"version": 0, "data": {"n": 1}})
        r = self.c.put("/api/state", json={"version": 1, "data": {"n": 2}})
        self.assertEqual(r.get_json()["version"], 2)

    def test_stale_version_conflicts_and_writes_nothing(self):
        self.c.put("/api/state", json={"version": 0, "data": {"n": 1}})
        self.c.put("/api/state", json={"version": 1, "data": {"n": 2}})

        # 另一台裝置還以為自己在版本 1
        r = self.c.put("/api/state", json={"version": 1, "data": {"n": 999}})
        self.assertEqual(r.status_code, 409)

        # 409 必須帶著伺服器版本回去，前端才有東西可以跟使用者比較
        body = r.get_json()
        self.assertEqual(body["version"], 2)
        self.assertEqual(body["data"], {"n": 2})

        # 而且真的沒被寫進去
        self.assertEqual(self.c.get("/api/state").get_json()["data"], {"n": 2})

    def test_state_is_per_user(self):
        self.c.put("/api/state", json={"version": 0, "data": {"owner": "a"}})
        self.c.post("/api/auth/logout")

        TOKENS["second"] = dict(TOKENS["good"], sub="sub-second", email="other@example.com")
        self.login("second")
        self.assertIsNone(self.c.get("/api/state").get_json()["data"])

    def test_malformed_body_rejected(self):
        self.assertEqual(self.c.put("/api/state", json={"data": {}, "version": -1}).status_code, 400)
        self.assertEqual(self.c.put("/api/state", json={"version": 0}).status_code, 400)

    def test_oversized_state_rejected(self):
        big = {"blob": "x" * (app_module.Config.MAX_STATE_BYTES + 1024)}
        r = self.c.put("/api/state", json={"version": 0, "data": big})
        self.assertIn(r.status_code, (400, 413))


class TestStatic(Base):
    def test_index_is_served(self):
        r = self.c.get("/")
        self.assertEqual(r.status_code, 200)
        self.assertIn(b"Zyra", r.data)
        r.close()

    def test_src_is_served(self):
        r = self.c.get("/src/js/store.js")
        self.assertEqual(r.status_code, 200)
        r.close()

    def test_backend_files_are_not_reachable(self):
        # 這是把 static_folder 設成 None、逐條列出可服務路徑的理由。
        # 若改成把專案根目錄整個掛上去，下面每一條都會變成 200。
        for path in (
            "/backend/.env",
            "/backend/config.py",
            "/backend/zyra.db",
            "/.git/config",
            "/src/../backend/config.py",
        ):
            r = self.c.get(path)
            self.assertNotEqual(r.status_code, 200, path)


if __name__ == "__main__":
    unittest.main(verbosity=2)
