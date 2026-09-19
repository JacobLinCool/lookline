# Fashion Network Prototype

## 1. 核心 Thesis

傳統 fashion ecommerce 的角色通常是：

> 觀察外部世界正在流行什麼 → 從 Instagram、TikTok、Reddit、搜尋趨勢等來源取得 signal → 推薦商品給使用者。

我們希望把這個方向反過來：

> **讓使用者直接在平台內創造、互相影響、共同演化 fashion，最後讓 trend 從平台向外傳播。**

因此平台不只是 **Trend Observer**，而是：

# Trend Maker

平台本身成為 trend 的生成場所、傳播起點與觀測點。

---

# 2. 從 Individual Commerce 轉向 Social Commerce

傳統 recommendation system 基本上假設：

> User → Product

也就是「這個人喜歡什麼、買什麼」。

但 fashion 天生不是完全個人的行為。

一個人的 fashion decision 可能受到：

* 朋友怎麼看我
* 我想呈現給某群人的形象
* 朋友最近買了什麼
* 某個人的穿搭啟發了我
* 我問誰的意見
* 誰幫我選了衣服
* 我要跟誰一起出門
* 我要買東西送給誰

因此更合理的模型是：

> **Person → Person → Product**

甚至：

> Person → Look → Person → Look → Product

Fashion purchasing 不應該只存在於個人的 preference profile 裡，而應該是一個群體互動的結果。

---

# 3. 我們真正要建立的是 Fashion Relationship Graph

我們不需要建立另一個 Instagram。

尤其不應該一開始建立：

* follower count
* generic feed
* generic likes
* comments
* DM
* influencer ranking

這些會讓產品直接進入既有 social media 的競爭。

我們需要的是 **commerce-native relationships**。

例如：

* A asks B for fashion advice
* A trusts B's taste
* A is inspired by B
* A styles B
* A buys for B
* A shops together with B
* A coordinates an outfit with B

也就是：

```text
Person ──asks──> Person
Person ──inspires──> Person
Person ──styles──> Person
Person ──buys-for──> Person
Person ──shops-with──> Person
```

這些 interaction 本身才建立 network。

Network 不應由：

> Add Friend

產生。

而應由：

> **Do Fashion Together**

自然產生。

---

# 4. Look：平台最重要的 Social Object

每一次 purchase 不應該只產生：

```text
Order #12345
```

還應該可以產生：

```text
Look
```

Look 是使用者與商品之間的數位 fashion artifact。

例如使用者購買一件 jacket 後，可以產生一張具有：

* fashion editorial
* magazine cover
* cinematic portrait
* visual campaign
* artistic collectible

風格的個人影像。

重點不是準確模擬試穿。

它不是：

> Virtual Try-On

而更接近：

> **Digital Fashion Edition**

商品是素材。

使用者才是作品的主體。

---

# 5. Purchase → Digital Ownership

Prototype 中可以採用：

```text
Purchase
   ↓
Unlock Digital Edition
   ↓
Create Look
```

每一個 Look 至少包含：

```text
Look
├── owner
├── products[]
├── image
├── aesthetic/style
├── created_at
├── visibility
└── lineage
```

它是一個可：

* 收藏
* 分享
* remix
* combine
* inspire
* collaborate

的 object。

這保留了 NFT 裡面有價值的部分：

* ownership
* uniqueness
* provenance
* collection
* identity

但完全不需要 blockchain。

---

# 6. 三個最重要的 Social Primitives

Prototype 第一版不需要做很多功能。

我建議只驗證三個。

---

## Primitive A — Ask

使用者在考慮商品或 Look 時：

> Ask a friend

例如：

```text
Which one fits me better?

[A]        [B]

Alice thinks: A
```

這個 interaction 同時產生：

```text
A → asked → B
B → advised → A
```

如果最後 A 購買 B 推薦的商品：

```text
B → influenced → A → purchase
```

這是一個遠比 Like 更強的 signal。

---

## Primitive B — Remix / Make It Mine

使用者看到另一個人的 Look：

> Make it mine

AI 可以保留：

* aesthetic
* mood
* composition
* color palette

但換成：

* 我的 identity
* 我的 wardrobe
* 我的 preference
* 適合我的商品

形成：

```text
Alice Look
    ↓
 inspired
    ↓
Jacob Look
```

這會形成真正的 fashion propagation。

而且我們可以知道：

> 一個 aesthetic 是從誰開始，傳給誰，再產生什麼 downstream action。

---

## Primitive C — Together

兩個或更多人各自有 Look 後，可以：

> Create Together

例如：

```text
Jacob Look + Alice Look
        ↓
   Shared Edition
```

不應只是把兩張圖拼起來。

而是重新生成一個：

> group editorial / shared fashion moment

例如：

* travel
* date
* festival
* wedding
* graduation
* party
* seasonal look

這讓 fashion 從：

> 我的 outfit

變成：

> **我們的 fashion context**

---

# 7. Outward Propagation

平台內的 Look 必須非常容易向外分享。

例如：

```text
Look
 ↓
Instagram
TikTok
Messages
LINE
External link
```

但分享出去的東西不應像：

> 商品廣告

而應該是一件使用者願意代表自己公開的作品。

因此原則是：

# Person first, product second.

好的結果應該讓使用者覺得：

> 「這是我的作品。」

而不是：

> 「我在替商店打廣告。」

---

# 8. Trend Maker Flywheel

完整 loop：

```text
Purchase
    ↓
Create Look
    ↓
Share / Ask / Remix / Together
    ↓
Person-to-person interaction
    ↓
New Look
    ↓
Product discovery
    ↓
Purchase
    ↓
New Look
```

並且其中部分 Look：

```text
Platform
   ↓
External Social Media
   ↓
New Audience
   ↓
Platform
```

因此形成：

# Commerce → Creation → Social Interaction → Influence → Commerce

這是整個產品最重要的 flywheel。

---

# 9. Trend 不再只是 Popularity

我們真正想知道的不是：

> 最近什麼商品賣最多？

而是：

> **什麼 aesthetic 正在透過哪些人向哪些人傳播？**

因此 trend 應該保存 lineage。

例如：

```text
Alice
  ↓ created
Look A
  ↓ inspired
Bob
  ↓ remixed
Look B
  ↓ shared
Carol
  ↓ purchased
Product C
  ↓ created
Look C
```

這整條 chain 都是 first-party data。

---

# 10. 我們因此得到的新 Data Layer

傳統 ecommerce 大多知道：

```text
User viewed Product
User clicked Product
User bought Product
```

我們可以增加：

```text
User asked Person about Product
Person recommended Product
User was inspired by Person
User remixed Person's Look
Person styled User
User created Look with Person
User bought Product for Person
User bought after seeing Person's Look
```

這會讓我們得到三個 graph。

## Social Graph

```text
Person ↔ Person
```

誰與誰真的發生 fashion interaction。

## Taste Graph

```text
Person ↔ Aesthetic ↔ Product
```

誰具有什麼 taste、哪些人的 taste 相近。

## Influence Graph

```text
Person → Person → Action
```

誰真正影響了誰。

其中 Influence Graph 對 trend discovery 最重要。

---

# 11. Prototype 要驗證的 Hypotheses

Prototype 不需要證明整個 social network 可以成立。

只需要驗證下面幾件事情。

### H1 — Digital Edition 有價值

使用者完成購買後，是否願意建立自己的 Look？

### H2 — Look 值得分享

使用者是否願意：

```text
share externally
OR
send to a friend
```

### H3 — Fashion 可以產生 person-to-person interaction

朋友收到 Look 後是否真的會：

```text
respond
remix
choose
style
```

而不是單純看完。

### H4 — Interaction 可以產生下一個 commerce action

例如：

```text
Look
→ friend interaction
→ product discovery
→ consideration / purchase
```

### H5 — 我們可以從這些 interaction reconstruct influence

例如能知道：

```text
Who inspired whom?
What propagated?
Where did it spread?
What eventually converted?
```

如果以上成立，network 才值得往下做。

---

# 12. Prototype User Flow

第一版建議只有一條完整 flow。

## User A

```text
Purchase Product
      ↓
Create My Look
      ↓
AI generates fashion editorial
      ↓
Save Look
```

Look page 提供：

```text
Ask a Friend
Create Together
Share
```

---

## User B

收到 shared link：

```text
Jacob created a new Look.
```

不要求先註冊。

可以：

```text
♥ React
Ask about product
Make It Mine
Style Jacob
```

其中 prototype 最重要的是：

> Make It Mine

---

## User B → Remix

```text
Alice sees Jacob Look
        ↓
Make It Mine
        ↓
Choose product / aesthetic
        ↓
Create Alice Look
```

保存：

```text
Alice Look
derived_from = Jacob Look
```

---

## Optional Purchase

如果 Alice 最後購買：

```text
purchase_attribution:
  source = Jacob Look
```

此時完整 influence chain 成立。

---

# 13. Prototype UI

最低限度需要：

### 1. Purchase Complete

```text
Your piece is yours.

[ Create My Edition ]
```

### 2. Look Generator

* upload/select photo
* choose style
* choose product
* generate

### 3. Look Page

顯示：

* image
* creator
* products
* creation lineage

Actions：

```text
Ask
Make It Mine
Together
Share
```

### 4. Shared View

朋友不登入也能查看與 interaction。

### 5. Remix Flow

從 Look 直接建立 derivative Look。

### 6. My Wardrobe / My Editions

只需要非常簡單的 grid。

### 7. Lineage

例如：

```text
Inspired by Alice
      ↓
Jacob
      ↓
Remixed by 4 people
```

不需要複雜 graph visualization。

---

# 14. Minimal Data Model

Prototype 不需要 Graph DB。

PostgreSQL 就足夠。

```text
users
products
purchases
looks
look_products
interactions
relationships
shares
```

其中最重要的是 `interactions`。

```text
interaction {
    actor_user_id
    target_user_id?
    look_id?
    product_id?
    type
    source_interaction_id?
    created_at
}
```

`type`：

```text
VIEW
SHARE
ASK
ADVISE
REMIX
TOGETHER
INSPIRE
STYLE
PURCHASE
BUY_FOR
```

Relationship 不需要一開始人工建立。

可以由 event aggregate 得到：

```text
A asked B 5 times
B influenced A 2 purchases
A remixed B 3 times
```

之後再推導：

```text
taste_trust(A, B)
influence(B, A)
shopping_relationship(A, B)
```

---

# 15. Trend Data

每一個 Look 必須保存：

```text
parent_look_id
source_user_id
source_product_ids
aesthetic_tags
```

如此可以計算：

```text
Propagation velocity
Propagation depth
Number of branches
Unique people reached
Cross-group propagation
Share → Remix rate
Remix → Purchase rate
Downstream GMV
```

Prototype 最值得看的不是：

```text
likes
```

而是：

```text
How many new actions did this Look create?
```

---

# 16. Privacy / Visibility

因為這裡同時涉及：

* 個人照片
* relationship
* purchase
* inferred preference

Prototype 一開始應該採用強 private-by-default。

Look visibility：

```text
Private
Shared by link
Public
```

Friend graph 不需要公開。

也不要顯示：

```text
Jacob influences Alice: 83%
```

這些是 recommendation / trend system 的內部 signal，不是 social score。

---

# 17. 明確的 Non-Goals

Prototype 第一版不要做：

* Instagram-style infinite feed
* followers
* follower counts
* public popularity ranking
* generic chat
* comments system
* creator economy
* influencer marketplace
* complex groups
* realtime messaging
* graph database
* sophisticated recommendation algorithm

我們現在不是在驗證：

> 能不能做 social media。

而是在驗證：

> **fashion transaction 能不能自然產生 social interaction，而 social interaction 能不能再產生下一個 fashion transaction。**

---

# 18. Product Principles

整個 prototype 應該遵循六個原則。

### 1. Trend Maker, not Trend Observer

讓 trend 從平台裡面長出去。

### 2. Fashion is Social

Fashion decision 不只是 individual preference。

### 3. Interaction, not Following

Relationship 從共同做事情產生，而不是按 Follow。

### 4. Creation, not Advertisement

使用者分享的是自己的作品，不是商品廣告。

### 5. Propagation, not Popularity

Trend 的本質不是「很多人喜歡」，而是：

> **一個 fashion idea 如何在人與人之間移動。**

### 6. Intelligence Without Waiting

> **AI should increase capability without making the interface feel slower.**

AI capability must not introduce perceptible friction into ordinary interaction. Constrained
actions should feel instantaneous, while generative actions must continuously reveal meaningful progress.

| Class | Interaction | Perceived latency contract |
| --- | --- | --- |
| Instant | 收藏、A/B 選擇、加入 Look、Ask、切換 style、filter / sort、fork | ≤100 ms acknowledgement；≤400 ms perceived completion |
| Generative | 自由文字、推薦、解釋、自然語言搜尋 | ≤800 ms first meaningful progress；progress 間隔 ≤800 ms；≤5 s usable result |
| Creative | 圖像生成 | ≤800 ms first meaningful progress；progress 間隔 ≤800 ms；≤5 s first meaningful visual；≤30 s final output |

使用者操作後立即得到可繼續操作的狀態；AI 在背景改善建議、排序與圖像。
Ask 的送出不等待 AI 生成回覆建議；Make It Mine 先建立可編輯的 remix，後續建議不覆蓋使用者的選擇。

**A spinner is not progress.** 進度必須增加對結果的理解：已識別的條件、實際找到的商品、
可操作的候選卡片或根據選定商品產生的構圖。倒數、假百分比與定時輪播文案不算進度。
預覽必須清楚標示，不能把 preview 或逾時錯誤算成 final output。

> **Optimize time-to-next-action, not merely model latency or time-to-completion.**

量測從使用者操作到畫面實際可用，包含傳輸與繪製時間。實作、失敗恢復與 PR 驗收依
[Perceived Latency Contract](../docs/specs/LATENCY_SPEC.md)。

---

# 19. 最小 Prototype

如果必須把 scope 壓到非常小，我會只做：

```text
1. Purchase / owned product
2. Generate a personal Look
3. Share Look to another person
4. Recipient can "Make It Mine"
5. Generate derivative Look
6. Record complete lineage
7. Allow derivative Look to lead back to products
```

完整 flow：

```text
A buys
 ↓
A creates Look
 ↓
A sends B
 ↓
B remixes
 ↓
B discovers product
 ↓
B buys
 ↓
B creates Look
 ↓
B sends C
```

如果我們能在 prototype 裡看到這條 chain 真正發生：

# 我們就已經證明了最核心的產品假設。

因為那代表我們不只是建立了一個 ecommerce feature。

我們建立的是一個：

# Fashion Propagation Network

它同時是：

* commerce system
* social system
* recommendation system
* first-party trend sensing system
* trend creation system

而且這些能力全部由同一組 interaction 自然產生。
