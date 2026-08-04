# PhilosophyOS 数字身份与 Avatar Customization System

## 1. 产品定位

Avatar 系统不是普通商城，也不是把一张头像换成另一张头像。它是 PhilosophyOS 的“数字身份层”：用户可以创建一个属于自己的虚拟角色，通过分层服装、饰品、动作和特效表达当下的思想气质，并在未来把角色带到档案、社交展示和 AI 生成内容中。

整体体验参考 Roblox Avatar、Apple Memoji、Discord Profile 和游戏角色编辑器，但视觉上保持 PhilosophyOS 的克制、收藏感和哲学博物馆气质。

### 目标

- 用户无需付费即可创建基础角色并完成实时换装。
- 每个角色由可替换的 Layer 合成，而不是绑定一张最终图片。
- 选择服装、饰品或特效后，预览区即时更新，不刷新页面。
- 为库存、虚拟货币、商城、收藏和未来 AI 生成服装建立稳定的数据边界。
- 角色配置、拥有关系和购买记录严格归属于 `user_id` / `workspace_id`。

### 非目标

- 第一阶段不实现真实支付、链上 NFT 或强制登录。
- 不把用户的角色数据默认公开给其他用户。
- 不要求一开始就支持完整 3D 捏脸；2D 分层合成可以先交付。
- 不用“稀有度”制造付费压力；稀有度只作为目录与收藏信息。

## 2. 角色分层模型

一个 Avatar 由以下 Layer 按固定顺序合成：

```text
Avatar
├── Base Character   基础人物
├── Face             脸部与表情
├── Hair             发型
├── Bottom           下装
├── Shoes            鞋子
├── Top              上装
├── Outerwear        外套
├── Accessories      眼镜、帽子、耳饰、项链、背包、手持物
└── Special Effects  光效、粒子、姿态光晕
```

渲染器必须使用稳定的 `zIndex` 和锚点（anchor）规则，让每个 Layer 能单独替换，同时保证不同素材的头部、肩部、腰部和手部对齐。

### Layer 规则

- `Base Character` 必须存在，其他 Layer 可以为空。
- `Top`、`Bottom`、`Shoes`、`Outerwear` 各自最多装备一件。
- `Accessories` 和 `Special Effects` 支持多个，但每个槽位有数量上限。
- 互斥规则由目录数据声明，例如戴全罩式头盔时隐藏发型。
- 缺失或下架素材不能让角色消失；渲染器回退到最后一个有效配置或默认素材。
- 保存的是 Layer ID，不保存拼接后的图片作为唯一真相；最终合成图只作为缓存或分享缩略图。

## 3. 核心数据结构

以下结构是前后端共享的产品契约，字段可按实际 ORM/DTO 命名调整。

```ts
type AvatarLayerState = {
  characterId: string;
  faceId?: string;
  hairId?: string;
  topId?: string;
  bottomId?: string;
  shoesId?: string;
  outerwearId?: string;
  accessoryIds: string[];
  effectIds: string[];
  actionId?: string;
};

type AvatarConfig = {
  id: string;
  userId: string;
  workspaceId: string;
  name: string;
  layers: AvatarLayerState;
  visibility: "private" | "workspace" | "public";
  createdAt: string;
  updatedAt: string;
};

type CatalogItem = {
  id: string;
  name: string;
  category:
    | "character"
    | "face"
    | "hair"
    | "top"
    | "bottom"
    | "shoes"
    | "outerwear"
    | "special_outfit"
    | "glasses"
    | "hat"
    | "earring"
    | "necklace"
    | "backpack"
    | "held_item"
    | "effect";
  rarity: "common" | "rare" | "limited" | "legendary";
  assetUrl: string;
  previewUrl: string;
  anchorVersion: string;
  price: number;
  currency: "coins";
  owned: boolean;
  locked: boolean;
  favorited: boolean;
  limitedUntil?: string;
  metadata?: Record<string, string>;
};

type Inventory = {
  userId: string;
  workspaceId: string;
  ownedItemIds: string[];
  currencyBalance: number;
  updatedAt: string;
};
```

### 货币与账本

余额不能直接覆盖写入，所有增减必须追加到不可变的 ledger：

```ts
type CurrencyLedgerEntry = {
  id: string;
  userId: string;
  workspaceId: string;
  currency: "coins";
  delta: number;
  balanceAfter: number;
  reason:
    | "grant"
    | "purchase"
    | "refund"
    | "admin_adjustment"
    | "promo";
  referenceType?: "catalog_item" | "order" | "promotion";
  referenceId?: string;
  idempotencyKey: string;
  createdAt: string;
};
```

`idempotencyKey` 用于避免重复扣款；订单、库存归属和账本写入必须在同一个事务边界内完成。第一阶段可以只提供演示余额和免费物品，不开放真实充值。

## 4. 组件与前端边界

建议拆分为以下组件，避免把商城逻辑塞入单一页面：

| 组件 | 职责 |
| --- | --- |
| `AvatarPreview` | 合成 Layer、显示动作、旋转/缩放、预览状态 |
| `AvatarLayer` | 渲染单个 Layer，处理锚点、z-index、资源加载和回退 |
| `ClothingSelector` | 上装、下装、鞋子、外套、特殊服饰筛选 |
| `AccessorySelector` | 眼镜、帽子、耳饰、项链、背包、手持物、特效 |
| `ItemCard` | 商品预览、稀有度、拥有/锁定/收藏状态 |
| `Inventory` | 已拥有物品、装备/卸下、余额和最近获得 |
| `AvatarShop` | 商品浏览、分类、筛选、详情、收藏和购买入口 |
| `AvatarActions` | 旋转、缩放、动作预设、重置和保存 |

页面采用“左侧角色预览 + 右侧上下文选择面板”的结构。选择器默认显示当前分类，其他分类折叠；移动端切换为底部抽屉，不挤压角色预览。

## 5. 实时预览与动效

用户点击物品后，先进入本地 `preview` 状态，再决定是否保存或购买：

1. 读取素材并校验 `anchorVersion`。
2. 将目标 Layer 以 `opacity + scale` 淡入，旧 Layer 淡出。
3. 对角色整体使用轻微 spring settle，避免像页面刷新。
4. 资源加载失败时回退到旧 Layer，并显示非阻塞提示。
5. 用户点击“保存角色”后，才提交 `AvatarConfig`。

动效建议使用 Framer Motion：

- Layer 替换：`opacity: 0 → 1`、`scale: 0.98 → 1`，约 180–260ms。
- 角色动作切换：spring，低阻尼、低幅度，不造成持续晃动。
- 选择器抽屉：从右侧滑入，300–420ms，支持减少动效设置。
- 新获得物品：短暂 glow，不使用持续闪烁。

拖拽旋转和滚轮缩放只改变预览状态，不应触发页面滚动。预览容器需要 `overscroll-behavior: contain`，并在拖拽期间锁定指针捕获。

## 6. 服装、饰品和动作体验

### 服装分类

- 上装：T-shirt、Hoodie、Jacket、Coat、Suit
- 下装：Jeans、Shorts、Formal Pants
- 鞋子
- 外套
- 特殊服饰

### 饰品分类

- 眼镜、帽子、耳饰、项链
- 背包、手持物品
- 特殊装饰与特效

每件物品都应明确显示：名称、分类、稀有度、预览、拥有/锁定状态、价格和收藏按钮。锁定物品允许预览，但不能静默装备或扣款。

动作预设可以先提供 `idle`、`thinking`、`reading`、`walking` 四种。动作是 Avatar 的表现层，不改变服装配置。

## 7. 商城与商业化边界

### 第一阶段：免费编辑器

- 提供默认角色、基础服装和基础饰品。
- 不要求支付，不要求绑定银行卡。
- 允许本地模式创建和保存角色。
- 商品目录可以展示价格字段，但购买按钮显示为“即将开放”或使用演示币。

### 第二阶段：Avatar Shop

- 浏览商品、分类筛选、稀有度筛选、详情、收藏。
- 商品下架不影响已拥有物品的使用。
- 限定商品包含 `limitedUntil`，但不能通过前端时间判断是否已拥有。
- 购买接口返回订单、库存和账本结果；前端只展示服务端确认后的状态。

### 第三阶段：真实支付

真实支付必须独立于 Avatar 渲染器。支付成功、退款、撤销和人工调整都通过订单服务写入 `CurrencyLedger` 与审计事件，不能由客户端直接修改余额或 `owned`。

## 8. 隔离、安全与隐私

- `AvatarConfig`、库存、收藏、订单和货币账本都必须带 `user_id` 与 `workspace_id`。
- 公共目录素材可以跨工作区复用，但用户的装备、收藏和角色可见性不能跨工作区泄露。
- 分享前生成脱敏的公开快照；不暴露内部商品成本、订单号或用户标识。
- AI 生成服装的提示词、参考图和生成结果默认私有，只有用户主动发布才进入公开展示。
- 审计记录只保留动作、目标、结果和请求 ID，不记录完整支付凭据或 API Key。
- 删除工作区时，角色配置、库存、收藏、订单关联和私有生成资产按保留策略处理；公共目录与公共素材不删除。

## 9. 后续扩展接口

预留以下能力，但不阻塞首版：

- **AI 生成服装：** `designPrompt`、`referenceAssetId`、`generationStatus`、`moderationStatus`。
- **收藏体系：** 系列、编号、获得来源、展示柜和稀有度历史。
- **社交展示：** 公开角色卡、访问权限、分享快照和举报入口。
- **角色成长：** 成就、动作解锁、主题套装和成长事件。
- **NFT-like 收藏：** 仅保留不可变收藏编号与来源字段，不承诺链上资产或金融价值。

## 10. 分阶段验收

### 编辑器 Alpha

- 可创建角色、替换每个 Layer、预览和保存。
- 无刷新切换素材，缺失素材有回退。
- 旋转/缩放不带动整页滚动。
- 角色配置可导出，且不包含 API Key。

### 商城 Beta

- 商品目录、筛选、详情、收藏和库存状态可用。
- 免费物品可直接装备；锁定物品只能预览。
- 演示币购买具备幂等、库存一致性和账本记录。
- 下架、退款和重复请求有明确状态。

### 商业化 Release

- 真实支付由服务端订单与账本驱动。
- 跨工作区访问、重复扣款、越权装备测试全部通过。
- 删除、导出、备份恢复和审计链路通过验收。
- 用户关闭公开展示后，公开快照不可继续访问。
