"""Zyra — AI 代理（Gemini 代理層）

這支程式**不執行任何 action**，它只做三件事：
  1. 保管 API key（瀏覽器永遠看不到它）
  2. 把前端送來的工具定義轉成 Gemini 的格式
  3. 轉送對話，把模型想呼叫的 function call 原樣交回前端

action 由**前端**執行，走 `Zyra.actions.dispatch()`——與使用者按按鈕
完全同一條路徑。若改成在後端用 Python 重寫那 38 個 action，
就會出現「AI 改的結果跟手動改的不一樣」，而那正是當初設計命令層要避免的事。
順帶的好處：AI 的每一步都自動進復原堆疊，Ctrl+Z 免費可用。

工具定義由前端從 `Zyra.actions.schema()` 產生後送上來，不在這裡另寫一份。
後端多維護一份規格，遲早會跟 actions.js 不同步；而不同步的工具描述
會讓模型用錯參數，錯得還很難查。
"""

import json

import requests
from flask import Blueprint, jsonify, request

import auth
from config import Config

bp = Blueprint("agent", __name__)

API_ROOT = "https://generativelanguage.googleapis.com/v1beta/models"

# 一次對話裡最多讓模型連續呼叫幾輪工具。
# 沒有上限的話，模型繞不出來時會一直呼叫下去，帳單跟著一起跑。
MAX_STEPS = 8

SYSTEM_PROMPT = """你是 Zyra 的內建助理。Zyra 是專案管理系統，結構是：部門 → 看板 → 欄位 → 卡片。

工作方式：
- 先用 listStructure 或 findCards 取得真正的 id，再做任何操作。**絕對不要自己編造 id。**
- 使用者說「北向出貨那張卡」這種話時，用 findCards 搜尋，找到才動手。
- 找不到、或找到多筆無法判斷是哪一筆時，就問使用者，不要猜。
- 可以連續呼叫多個工具完成一件事，不必每步都回報。
- 全部做完後，用一兩句話說明你做了什麼。不要複述工具的原始回傳值。

語氣：繁體中文，簡潔，像同事而不是客服。不要用條列式回報每個步驟，除非使用者要求。

注意：
- 今天的日期會在下方的系統現況裡給你，日期一律用 YYYY-MM-DD 格式。
- 你看到的卡片數量可能只是搜尋結果的一部分，需要完整資料時再查一次。
"""

_TYPES = {
    "string": "STRING",
    "string[]": "ARRAY",
    "boolean": "BOOLEAN",
    "number": "NUMBER",
    "integer": "INTEGER",
    "any": "STRING",
}


def to_gemini_tools(schema: list) -> list:
    """把 Zyra.actions.schema() 的輸出轉成 Gemini 的 function declarations。"""
    decls = []
    for item in schema:
        props = {}
        required = []
        for p in item.get("parameters", []):
            gtype = _TYPES.get(p.get("type"), "STRING")
            spec = {"type": gtype, "description": p.get("description") or p.get("name")}
            if gtype == "ARRAY":
                spec["items"] = {"type": "STRING"}
            if p.get("values"):
                spec["enum"] = [str(v) for v in p["values"]]
            props[p["name"]] = spec
            if p.get("required"):
                required.append(p["name"])

        decl = {
            "name": item["name"],
            "description": item.get("description") or item["name"],
        }
        # 沒有參數的工具不能送空的 properties，Gemini 會拒絕整個請求
        if props:
            decl["parameters"] = {"type": "OBJECT", "properties": props, "required": required}
        decls.append(decl)
    return [{"function_declarations": decls}]


def call_gemini(contents: list, tools: list, snapshot) -> dict:
    body = {
        "system_instruction": {
            "parts": [
                {"text": SYSTEM_PROMPT},
                {"text": "系統現況（JSON）：\n" + json.dumps(snapshot, ensure_ascii=False)},
            ]
        },
        "contents": contents,
        "tools": tools,
        "generationConfig": {"temperature": 0.3, "maxOutputTokens": 2048},
    }
    res = requests.post(
        "%s/%s:generateContent" % (API_ROOT, Config.GEMINI_MODEL),
        params={"key": Config.GEMINI_API_KEY},
        json=body,
        timeout=60,
    )
    if res.status_code != 200:
        # 不把 Google 的原始錯誤整包往前端送——裡面可能帶著請求內容。
        # 但狀態碼要留著，因為 429（額度用盡）跟 400（我們送錯）
        # 對使用者是完全不同的兩件事。
        raise GeminiError(res.status_code, _brief_error(res))
    return res.json()


def _brief_error(res) -> str:
    try:
        msg = res.json().get("error", {}).get("message", "")
    except ValueError:
        msg = ""
    if res.status_code == 429:
        return "Gemini 配額已用盡或請求過於頻繁，請稍後再試。"
    if res.status_code in (401, 403):
        return "Gemini API key 無效或沒有權限，請確認 backend/.env 的 ZYRA_GEMINI_API_KEY。"
    if res.status_code == 400:
        return "送給 Gemini 的請求格式有誤。" + (" " + msg[:200] if msg else "")
    return "Gemini 回應 %d。" % res.status_code


class GeminiError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status
        self.message = message


def split_parts(candidate: dict):
    """把模型回應拆成「文字」與「要呼叫的工具」。一次回應可能兩者都有。"""
    parts = (candidate.get("content") or {}).get("parts") or []
    text = "".join(p["text"] for p in parts if "text" in p).strip()
    calls = [
        {"name": p["functionCall"]["name"], "args": p["functionCall"].get("args") or {}}
        for p in parts
        if "functionCall" in p
    ]
    return text, calls, parts


@bp.post("/api/agent/chat")
@auth.require_login
def chat(_user):
    if not Config.GEMINI_API_KEY:
        return jsonify({"error": "伺服器尚未設定 ZYRA_GEMINI_API_KEY。"}), 503

    body = request.get_json(silent=True) or {}
    contents = body.get("contents")
    schema = body.get("tools")
    snapshot = body.get("snapshot")

    if not isinstance(contents, list) or not contents:
        return jsonify({"error": "缺少對話內容。"}), 400
    if not isinstance(schema, list) or not schema:
        return jsonify({"error": "缺少工具定義。"}), 400
    if len(contents) > MAX_STEPS * 3 + 4:
        return jsonify({"error": "這輪對話太長了，請開新的對話。"}), 400

    try:
        data = call_gemini(contents, to_gemini_tools(schema), snapshot)
    except GeminiError as e:
        return jsonify({"error": e.message}), 502
    except requests.RequestException:
        return jsonify({"error": "連不上 Gemini，請確認網路。"}), 502

    candidates = data.get("candidates") or []
    if not candidates:
        # 通常是內容被安全機制擋下
        reason = (data.get("promptFeedback") or {}).get("blockReason")
        return jsonify({"error": "模型沒有回應" + ("（%s）" % reason if reason else "") + "。"}), 502

    cand = candidates[0]
    text, calls, parts = split_parts(cand)

    if cand.get("finishReason") == "MAX_TOKENS" and not calls:
        text = (text + "\n\n（回應被長度上限截斷）").strip()

    return jsonify({
        "text": text,
        "calls": calls,
        # 原樣交回模型這一輪的 parts，前端要把它接回 contents 再送下一輪。
        # 由前端保管對話歷史，後端就完全無狀態——不必存 session、
        # 不必處理過期，重開一台後端也不影響進行中的對話。
        "modelParts": parts,
        "usage": data.get("usageMetadata"),
    })


@bp.get("/api/agent/status")
@auth.require_login
def status(_user):
    return jsonify({
        "enabled": bool(Config.GEMINI_API_KEY),
        "model": Config.GEMINI_MODEL,
        "maxSteps": MAX_STEPS,
    })
