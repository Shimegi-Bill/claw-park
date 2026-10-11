# 夾公仔樂園 · Claw Park 3D

手機優先嘅 3D 夾公仔機網頁遊戲，用真實物理引擎計算爪、公仔同獎品嘅碰撞。

## 五款機

| 機 | 爪 | 玩法 | 收費 |
|---|---|---|---|
| 三爪公仔機 | 三爪（硬身） | 公仔堆，夾起拎去左下角出口 | 1 幣 1 局 |
| 兩爪橋機 | UFO 式兩爪 | 盒擺喺兩條橋上，推、撬、轉，跌落中間就贏 | 2 幣 1 局 |
| 甩爪機 | 三爪（繩吊，會擺） | 天車一郁爪就擺，可以甩去撞、去勾 | 1 幣 1 局 |
| 塑膠環機 | 幼爪尖兩爪 | 爪尖穿入公仔頭頂個膠環，吊起拎去出口 | 2 幣 1 局 |
| 吊環機 | 幼爪尖兩爪 | 用爪推個環，令佢甩出鈎頭跌落 | 1 幣 1 局 |

每 5 局送 1 局。

## 功能

- **投幣**：將金幣拖入投幣口先開機（亦可以直接撳金幣）。每日送 20 幣；金幣少過 5 個，每 30 分鐘可以免費補 10 個。
- **兩種操控**：日式兩掣（按住 ① 向右、按住 ② 向入，放手就落爪），或者搖桿自由移動 + 限時。
- **2收爪**：
  - 落爪途中再撳「收爪」，即刻停低收爪。
  - 二段爪力：夾起之後爪力轉弱（到頂 / 扯起一半 / 返出口時），好似真機咁有機會甩返落嚟。
- **爪力調校**（每部機獨立）：抓起爪力、二段爪力、二段收爪時機、保底局數、爪力隨機浮動、到頂震動。
- **圖鑑**：夾到嘅獎品自動收錄（公仔、膠環公仔、吊飾、手辦盒）。
- 鏡頭：正面 / 側面 / 斜角，拖動畫面轉鏡頭，雙指縮放。
- 電腦鍵盤：方向鍵或 WASD 移動、空白鍵落爪 / 收爪、`C` 入幣、`1` `2` 兩掣。

所有紀錄（金幣、圖鑑、設定）只存喺玩家自己瀏覽器嘅 localStorage。

## 放上 GitHub Pages

1. 喺 GitHub 開一個新 repository，例如 `claw-park`，揀 **Public**。
2. 入去個 repo，撳 **Add file → Upload files**，將呢個資料夾入面**所有嘢**（`index.html`、`js` 資料夾、`lib` 資料夾、`.nojekyll`）拖入去，再撳 **Commit changes**。
   用電腦嘅 Chrome / Edge 可以成個資料夾一次過拖入去。
3. 去 **Settings → Pages**，Source 揀 **Deploy from a branch**，Branch 揀 `main`、資料夾揀 `/ (root)`，撳 **Save**。
4. 等一至兩分鐘，網址會係：`https://shimegi-bill.github.io/claw-park/`

> 一定要經網址（GitHub Pages 或者本機伺服器）開，直接雙擊 `index.html` 會因為瀏覽器安全限制而載入唔到。

## 檔案結構

```
index.html          畫面同樣式
js/main.js          大廳、投幣、操控、設定、圖鑑
js/game.js          遊戲規則（贏、補貨）
js/machines.js      五款機嘅佈置同預設爪力  ← 想改難度就改呢度
js/claw.js          爪嘅物理（天車、捲揚、爪指馬達、2收爪）
js/prizes.js        公仔（布娃娃關節）、盒、膠環、吊飾
js/phys.js          Jolt 物理引擎包裝
js/render.js        3D 畫面（Three.js）
js/meshes.js        公仔同爪嘅 3D 模型
js/portrait.js      圖鑑頭像
js/audio.js         合成音效同背景音樂
js/store.js         本機儲存
lib/                Three.js r169、Jolt Physics 1.1（已經包埋，唔使網絡 CDN）
```

## 授權

- Three.js — MIT License（`lib/LICENSE-three.txt`）
- Jolt Physics / JoltPhysics.js — MIT License（`lib/LICENSE-jolt.txt`）
- 所有角色（布丁熊、棉花兔、芝麻貓等）同設計均為原創。
