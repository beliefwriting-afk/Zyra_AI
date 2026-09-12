"""Zyra — Flask 應用

前後端同源：這支程式同時服務 index.html、src/ 靜態檔與 /api/*。
同源代表沒有 CORS 問題，cookie 也不需要 SameSite=None——
跨網域 cookie 在各家瀏覽器的第三方 cookie 政策下是個持續惡化的坑。

靜態檔刻意逐條列出可服務的路徑（index.html 與 src/），
而不是把整個專案根目錄掛成 static_folder。
後者會連 backend/.env、backend/zyra.db、.git/ 都一起對外開放。
"""

import sys
from datetime import timedelta

from flask import Flask, jsonify, request, send_from_directory

import auth
import db
from config import Config, startup_warnings


def create_app() -> Flask:
    app = Flask(__name__, static_folder=None)
    app.config.update(
        SECRET_KEY=Config.SECRET_KEY,
        SESSION_COOKIE_HTTPONLY=Config.SESSION_COOKIE_HTTPONLY,
        SESSION_COOKIE_SECURE=Config.SESSION_COOKIE_SECURE,
        SESSION_COOKIE_SAMESITE=Config.SESSION_COOKIE_SAMESITE,
        PERMANENT_SESSION_LIFETIME=timedelta(seconds=Config.PERMANENT_SESSION_LIFETIME),
        MAX_CONTENT_LENGTH=Config.MAX_CONTENT_LENGTH,
        JSON_SORT_KEYS=False,
    )
    app.teardown_appcontext(db.close)
    db.init()

    # ---------- 靜態檔 ----------

    @app.get("/")
    def index():
        return send_from_directory(Config.ROOT_DIR, "index.html")

    @app.get("/src/<path:filename>")
    def src(filename):
        return send_from_directory(Config.ROOT_DIR / "src", filename)

    @app.get("/healthz")
    def healthz():
        return jsonify({"ok": True})

    # ---------- 身分 ----------

    @app.post("/api/auth/google")
    def auth_google():
        if not auth.same_origin_ok():
            return jsonify({"error": "請求來源不正確。"}), 403
        body = request.get_json(silent=True) or {}
        try:
            info = auth.verify_google_credential(body.get("credential"))
            auth.check_allowlist(info["email"])
        except auth.AuthError as e:
            return jsonify({"error": e.message}), e.status
        user = auth.login(info)
        return jsonify({"user": auth.public(user)})

    @app.post("/api/auth/logout")
    def auth_logout():
        if not auth.same_origin_ok():
            return jsonify({"error": "請求來源不正確。"}), 403
        auth.logout()
        return jsonify({"ok": True})

    @app.get("/api/me")
    @auth.require_login
    def me(user):
        return jsonify({"user": auth.public(user)})

    # ---------- 資料 ----------

    @app.get("/api/state")
    @auth.require_login
    def get_state(user):
        return jsonify(db.read_state(user["id"]))

    @app.put("/api/state")
    @auth.require_login
    def put_state(user):
        body = request.get_json(silent=True)
        if not isinstance(body, dict) or "data" not in body:
            return jsonify({"error": "格式不正確。"}), 400

        version = body.get("version", 0)
        if not isinstance(version, int) or version < 0:
            return jsonify({"error": "版本號不正確。"}), 400

        result = db.write_state(user["id"], version, body["data"])

        if result.get("too_large"):
            return jsonify({"error": "資料超過大小上限。"}), 413
        if result.get("conflict"):
            # 409 帶著伺服器上的完整版本回去，前端才有東西可以跟使用者比較
            return jsonify({
                "error": "版本衝突",
                "version": result["version"],
                "data": result["data"],
                "updatedAt": result["updatedAt"],
            }), 409

        return jsonify({"version": result["version"], "updatedAt": result["updatedAt"]})

    # ---------- 錯誤 ----------

    @app.errorhandler(404)
    def not_found(_e):
        # 刻意不做「任何未知路徑都回 index.html」的 SPA fallback。
        # Zyra 沒有前端路由，用不到；而它會讓 /backend/.env 這種請求
        # 回 200，之後就很難一眼判斷「這個路徑到底有沒有對外開放」。
        if request.path.startswith("/api/"):
            return jsonify({"error": "找不到這個端點。"}), 404
        return "Not Found", 404

    @app.errorhandler(413)
    def too_large(_e):
        return jsonify({"error": "資料超過大小上限。"}), 413

    return app


application = create_app()

if __name__ == "__main__":
    for w in startup_warnings():
        print("⚠  " + w, file=sys.stderr)
    print("→ http://localhost:8000", file=sys.stderr)
    application.run(host="127.0.0.1", port=8000, debug=not Config.IS_PROD)
