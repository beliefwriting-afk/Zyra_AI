# tools/ — 驗證腳本

改完東西之後要跑的檢查都在這裡。四組全過才算改完。

| 腳本 | 檢查什麼 | 在哪跑 |
|---|---|---|
| `check-contrast.py` | 46 組前景／背景的 WCAG AA 對比度 | 任何地方 |
| `smoke.js` | 瀏覽器回歸（local 與 server 兩種模式） | 需要 Chromium |
| `agent-e2e.js` | AI 助理的工具呼叫鏈路（含假 Gemini） | 需要 Chromium |
| `shot.js` | 擷圖，用來人眼複核版面 | 需要 Chromium |
| `../backend/test_api.py` | 後端 27 項（登入、樂觀鎖、靜態檔邊界） | **見下方警告** |

---

## 對比度

```
python tools/check-contrast.py
```

改過 `src/css/tokens.css` 就一定要跑。全過才算改完，不然「好看」是拿看不清楚換來的。

**已知陷阱**：不要為了讓數字過關而把底色往白色漂。數字會全綠，但標籤色塊和側邊欄選取狀態會變成看不出有底色——**一塊看不出來的底色等於沒做，通過檢查也沒有意義**。底色維持看得見的濃度，改去壓深前景文字。

---

## 瀏覽器回歸

```
node tools/smoke.js local  http://127.0.0.1:8010
node tools/smoke.js server http://127.0.0.1:8016
```

**local 模式必須跑在 `config.mode = 'local'` 的副本上。** repo 裡的 `config.mode` 是 `'auto'`，用 `http://` 開啟會判定成 server 模式，未登入時主畫面根本不會渲染，測試會在中途以莫名其妙的方式炸掉。腳本開頭已加保護會直接講明原因，但正確做法是：

```
cp -r . /tmp/zyra-local
sed -i "s/mode: 'auto'/mode: 'local'/" /tmp/zyra-local/src/js/config.js
cd /tmp/zyra-local && python3 -m http.server 8010
```

`CHROME_PATH` 可指定瀏覽器執行檔，不設就用 Playwright 自帶的 Chromium。

---

## ⚠️ 後端測試：不要用替身跑

```
cd backend && python3 -m pytest test_api.py -q
```

**必須在真的裝了 `google-auth[requests]` 的環境跑。**

這條警告是有代價換來的。開發時曾因為裝不到 `google-auth`，改用一個假模組頂替，27 項測試全過——然後君和在自己電腦上一跑就 `ModuleNotFoundError: No module named 'requests'`。原因是 `requirements.txt` 當時寫的是 `google-auth`，少了 `[requests]` 這個 extra，而替身模組沒有真實的 import 鏈，所以永遠測不出來。

**「相依裝完了」跟「相依裝對了」是兩件事。** 用替身跑出來的綠燈，只證明替身沒壞。
