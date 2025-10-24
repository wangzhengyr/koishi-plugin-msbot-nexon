# AGENTS.md

## 🧩 项目简介
本项目是一个基于 **Koishi** 的插件，使用封装库 **`maplestory-openapi`** 对接 **Nexon Open API（支持台湾冒险岛）**，  
实现角色、装备、等级、职业、排名等数据查询功能。  
目标是让 Koishi 机器人能以自然语言提供冒险岛（MapleStory）数据服务。

---

## 💡 开发目标
- 实现 `/maple` 系列命令：
  - `/maple info <角色名>`：查询角色基本信息  
  - `/maple rank <角色名>`：查询角色等级或战力排名  
  - `/maple equip <角色名>`：查询角色装备  
- 支持多地区 API（如台服、韩服、日服）
- 自动缓存与错误处理
- 控制台插件配置界面
- 输出中文优先（简体/繁体兼容）

---

## 🧠 Codex 行为规范

### 语言与风格
- 所有推理、解释、注释、建议均使用**中文**；
- 技术术语可在括号中附英文原文（如 *endpoint*, *rate limit*）；
- 输出逻辑清晰、简洁，不使用英文句式。

### 推理与输出规范
1. **先给出结论，再解释原因**；
2. 对报错或异常：
   - 说明错误含义；
   - 按可能性排序列出原因；
   - 提供解决方案；
   - 若为 Koishi 或 Nexon 特有机制，请简要说明；
3. 输出代码时：
   - 使用 TypeScript；
   - 注释为中文；
   - 优先使用 `maplestory-openapi` 封装；
   - 禁止直接使用 `axios` 或裸请求。

---

## ⚙️ 技术栈
- **语言**：TypeScript  
- **框架**：Koishi v4+  
- **构建工具**：Vite 5  
- **API 封装库**：[`maplestory-openapi`](https://www.npmjs.com/package/maplestory-openapi)  
- **主要依赖**：
  - `koishi`
  - `@koishijs/plugin-console`
  - `@koishijs/plugin-help`
  - `maplestory-openapi`
  - 可选：`dayjs`、`node-cache`、`axios-retry`

---

## 📁 项目目录结构（最新版）

```bash
koishi-plugin-maplestorytw/
├── src/
│   ├── index.ts                # 插件主入口
│   ├── commands/               # 命令注册与逻辑模块
│   │   ├── info.ts             # /maple info 指令
│   │   ├── rank.ts             # /maple rank 指令
│   │   └── equip.ts            # /maple equip 指令
│   ├── api/                    # API 调用与封装层
│   │   ├── client.ts           # maplestory-openapi 客户端初始化
│   │   ├── types.ts            # SDK 类型声明与接口扩展
│   │   └── cache.ts            # 内存缓存（短期缓存）
│   ├── data/                   # 数据层（数据库、用户历史、统计）
│   │   ├── db.ts               # 数据库初始化（可选）
│   │   ├── user-history.ts     # 用户查询记录存储
│   │   └── stat.ts             # 排行榜或调用统计缓存
│   ├── entities/               # 实体与接口层（业务类型定义）
│   │   ├── character.ts        # 角色信息接口（CharacterInfo）
│   │   ├── equipment.ts        # 装备信息接口（EquipmentItem）
│   │   ├── ranking.ts          # 排名数据接口
│   │   └── index.ts            # 类型统一导出
│   ├── utils/                  # 工具函数（通用逻辑）
│   └── config/                 # 配置与常量
│       └── index.ts
├── package.json
├── tsconfig.json
├── vite.config.ts
├── AGENTS.md
└── README.md
