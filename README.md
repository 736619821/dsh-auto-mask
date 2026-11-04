<div align="center">

# dsh-auto-mask

**面向 DeepSeek Harness 的智能 PII 脱敏插件——在个人数据进入模型前匿名化，并保留语义上下文。**

*电话、邮箱、身份证、银行卡、密钥等在模型边界变成占位符；邮箱自动区分个人/企业域名，以 `***@example.com` 保留"这是邮箱"的上下文信号；原文绝不进入会话日志。*

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![DSH plugin](https://img.shields.io/badge/dsh--plugin-✅-green)](https://github.com/topics/dsh-plugin)
[![Node](https://img.shields.io/badge/node-%5E22.19%20%7C%7C%20%3E%3D24-brightgreen.svg)](#)

[简体中文](README.md)

</div>

---

## 核心特性

| 特性 | 说明 |
|---|---|
| 🧠 **邮箱智能分类** | 自动区分**个人邮箱**（`gmail.com` / `qq.com` / `163.com` / `outlook.com` / `protonmail.com` 等免费邮箱）与**企业邮箱**（`alibaba.com` / `huawei.com` / `microsoft.com` / 自有域名等），审计分布分别计数 |
| 📧 **上下文保留占位符** | 邮箱替换为 `***@example.com_1`（固定域名 + 唯一序号）——模型一眼知道"这是邮箱"，又不会泄露任何真实账号与域名细节，**不破坏上下文语义** |
| 🔒 **模型边界匿名化** | 重写 `agent/pre-step` 消息，PII 在进入模型前变成占位符；被遮罩的文本才是落盘并发送给模型的内容 |
| 💾 **可还原** | 占位符 → 原文映射只存内存 + 受控 storage domain（`dsh_auto_mask`），原文绝不进会话日志；`/mask restore` 按需还原 |
| 📊 **审计不含明文** | `automask/applied` 会话事件只记「替换了 N 处 + 类型分布」，不记原文与映射 |
| 🛠️ **双表面** | `/mask` 命令（status / on / off / restore / help）+ `mask_test` 工具（试跑一段文本看替换效果，绝不回显原文） |

```text
用户消息 ──agent/pre-step──▶ 占位符 ──模型──▶ 占位符 ──restore──▶ 受控文件
                              ▲                                        │
                              └──── 恢复表（内存 + dsh_auto_mask）─────┘
```

## 邮箱脱敏效果

### 需求 1：正则识别 `xxx@domain.tld` 并区分个人/企业邮箱

| 输入 | 分类 | 脱敏后 |
|---|---|---|
| `john.doe@gmail.com` | `EMAIL_PERSONAL`（个人） | `***@example.com_1` |
| `mary@qq.com` | `EMAIL_PERSONAL`（个人） | `***@example.com_2` |
| `zhang.san@huawei.com` | `EMAIL_ENTERPRISE`（企业） | `***@example.com_3` |
| `lisi@microsoft.com` | `EMAIL_ENTERPRISE`（企业） | `***@example.com_4` |

### 需求 2：占位符保留域名、不破坏上下文

- **固定域名** `example.com`：模型把 `***@example.com_N` 识别为"这是一个邮箱"，保留 `@` 与域名结构，**不泄露真实域名**（`gmail.com`、`huawei.com` 等都被统一为 `example.com`）；
- **唯一序号** `_1`、`_2`…：同一会话内不同邮箱占位符唯一，互不冲突，保证还原精确；
- **全局递增**：个人/企业邮箱共用同一计数序列，避免先个人后企业都产出 `_1` 的占位符冲突；
- **相同原文复用**：同一邮箱在本会话重复出现时复用同一占位符，模型看到的历史一致。

### 实际运行示例

输入：

```text
请发邮件到 david.chen@gmail.com，抄送 zhang.san@huawei.com，电话 13812345678
```

输出（进入模型的内容）：

```text
请发邮件到 ***@example.com_1，抄送 ***@example.com_2，电话 <PHONE_1>
```

审计统计（`/mask status`）：

```text
automask: enabled
  replaced: 3 total
  distribution: EMAIL_PERSONAL=1, EMAIL_ENTERPRISE=1, PHONE=1
```

## 安装

dsh-auto-mask 作为 profile bundle 安装：

- **本地目录通道**（开发）：
  ```sh
  # profile 的 package.json 增加 link 依赖后，在插件管理器中安装
  dsh plugin --profile <name> add D:/harness-2.1/dsh-auto-mask
  ```
- **插件管理器**（GUI / 清单）：`install_bundle` 指向 `D:\harness-2.1\dsh-auto-mask`，或在插件市场搜索 `dsh-auto-mask`。
- **卸载**：`dsh plugin --profile <name> remove dsh-auto-mask`，或从 profile patch 删掉该行。

> 无需构建步骤——`index.mjs` 与 `lib/` 即发布产物，纯 host、零外部运行时依赖（仅 `zod` 用于存储领域 schema 校验，随 bundle 安装）。

## 快速开始

```sh
# 1. 安装 bundle 进 profile
# 2. 校验行是否挂载
dsh --profile <name> --dump-config | grep -A2 'id: automask'
# 3. 在聊天中试跑工具
#    mask_test(text: "我的邮箱是 a@qq.com，公司邮箱 b@tencent.com，电话 13812345678")
```

预期工具返回：

```text
mask_test: replaced 3 PII value(s) (EMAIL_PERSONAL=1, EMAIL_ENTERPRISE=1, PHONE=1)
masked:
我的邮箱是 ***@example.com_1，公司邮箱 ***@example.com_2，电话 <PHONE_1>
```

## 配置

所有配置可在 profile patch 中覆盖（Schemastery schema，非法值响亮失败）：

```yaml
- insert:
    - id: automask
      name: dsh-auto-mask
      config:
        enabled: true                        # 总开关；false 时全部卸载
        mode: regex                          # 检测模式；仅 'regex' 实现
        entities:                            # 启用的实体类型
          - phone
          - email                            # 通用邮箱（关闭分类时使用）
          - email_personal                   # 个人邮箱（gmail/qq/163/outlook...）
          - email_enterprise                 # 企业邮箱（企业自有域名）
          - id-card
          - bank-card
          - key
          # - ip                            # 可选：IP（技术语境易误报）
        scope: [messages]                    # 'messages' 入站消息 / 'tools' 工具结果
        registerCommand: true                # 注册 /mask 命令
        registerTools: true                  # 注册 mask_test 工具
        persistRestoreTable: true            # 恢复表持久化到受控 storage domain
        maxRestoreEntriesPerSession: 500     # 每会话恢复条目上限（超出逐出最旧）
        maxSessions: 1000                    # 内存会话脱敏器上限（LRU）
        enableEmailClassification: true      # 邮箱个人/企业分类开关
        restoreDir: ''                       # restore 明文交付目录（空 = 系统临时目录）
```

### 实体与对应占位符

| 实体 | 占位符 | 说明 |
|---|---|---|
| `email_personal` / `email_enterprise` / `email` | `***@example.com_N` | 统一邮箱占位符（共享全局计数） |
| `phone` | `<PHONE_N>` | 中国大陆手机号 |
| `id-card` | `<ID_CARD_N>` | 18 位身份证 |
| `bank-card` | `<BANK_CARD_N>` | 16–19 位银行卡 |
| `key` | `<KEY_N>` | API Key / Secret（sk-、ghp_、AKIA、Bearer 等） |
| `ip` | `<IP_N>` | IPv4（可选，默认关闭） |

### 个人邮箱域名库

内置常见免费邮箱域名（支持新增）：`gmail.com`、`yahoo.com`、`hotmail.com`、`outlook.com`、`qq.com`、`foxmail.com`、`163.com`、`126.com`、`sina.com`、`sohu.com`、`139.com`、`icloud.com`、`protonmail.com`、`zoho.com`、`aol.com`、`mail.ru`、`yandex.com`、`charter.net` 等。

其余域名默认判为**企业邮箱**（尤其以 `.com`、`.net`、`.cn`、`.co.jp` 等后缀结尾的自有域名）。

## /mask 命令

| 子命令 | 说明 |
|---|---|
| `/mask status` | 显示开关状态、累计替换数、类型分布（默认） |
| `/mask on` | 运行时开启遮罩（持久开关是 `config.enabled`） |
| `/mask off` | 运行时关闭遮罩 |
| `/mask restore <text>` | 把占位符还原为原文，**明文写进受控文件**（每会话一个，`mode 0600`），结果只返回路径 + 占位符名，原文绝不进会话日志 |
| `/mask help` | 帮助 |

> **安全设计**：宿主把命令结果原样写进持久会话日志，`/mask restore` 因此绝不把明文放进结果文本——只用受控文件交付，防同一明文出现在转录与日志两条通道。

## 架构

```
index.mjs              插件入口：配置校验、命令/工具注册、agent/pre-step 与 tools/post-execute 监听
├── lib/constants.mjs  词汇表：实体、标签、模式、作用域、默认值、限制
├── lib/strip.mjs      ⚙️ 核心：正则检测 + 邮箱分类 + ***@example.com_N 占位符 + 还原
├── lib/mask.mjs       消息/内容块遮罩助手
├── lib/store.mjs      恢复表：每会话 Stripper（内存 LRU）+ storage domain 持久化
├── lib/domain.mjs     'dsh_auto_mask' 存储领域（zod 校验）
├── lib/gate.mjs       会话事件自适应门（automask/applied 审计）
├── lib/deliver.mjs    restore 明文的受控文件交付（0700/0600，防符号链接）
├── lib/sanitize.mjs   日志/展示前二次脱敏
└── lib/errors.mjs     结构化错误（code + details）
```

### 关键设计

- **邮箱分类解耦**：`email_personal`/`email_enterprise` 映射到同一条 `email` 正则 pattern，分类由域名列表在检测阶段决定——只要启用任一邮箱实体，邮箱就一定会被检测；
- **占位符唯一性**：邮箱占位符共享 `EMAIL` 计数器（`***@example.com_N`），个人/企业/通用邮箱不各自计数，杜绝跨类型序号冲突；
- **持久化兼容**：`loadMapping` 同时解析 `<LABEL_N>` 与 `***@example.com_N` 两种占位符格式，跨重启回载后计数不重置；
- **失败关闭**：任何异常都以不泄露原文的错误文本返回，绝不回退到"把明文放进结果文本"。

## 兼容性

| 维度 | 状态 |
|---|---|
| Harness | DeepSeek Harness 0.2.x（`dsh` 引擎区间 `>=0.1.2-rc.1 <0.3.0`） |
| Node | `^22.19.0 \|\| >=24.0.0` |
| 平台 | 任何 DSH 可运行处（纯 host、零依赖正则） |
| 存储 | 组合 storage 栈的 profile 开箱即用；bare profile 降级为纯内存恢复表（重启丢失，一次性告警） |
| 模型 | 文本模型完全支持；无需额外模型能力 |

## 测试

```sh
node test/review2.test.mjs
```

回归测试覆盖：个人/企业邮箱分类、占位符唯一性、还原正确性、`loadMapping` 回载计数、`enableEmailClassification=false` 退化行为、多实体端到端。

## 安全与隐私

- PII 原文只出现在内存映射与受控 storage domain，**绝不进会话日志**；
- `automask/applied` 审计事件只含计数与类型分布；
- restore 明文走 `0600` 受控文件，目录 `0700`，拒绝符号链接与异地属主；
- 日志/命令结果经 `redactText` 二次脱敏。

## License

[Apache-2.0](LICENSE)
