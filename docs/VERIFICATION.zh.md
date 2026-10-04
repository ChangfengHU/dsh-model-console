# Model Console 本机验收

日期：2026-10-03。部署位置：本机 DSH Web，127.0.0.1:3080。

## 已实现

- 三个页签：模型目录、接入来源、默认设置。
- Codex 能力的主入口移至 Model Console；旧技术入口读取相同的命名空间，没有新增第二份配置。
- Claude Code 独立设置入口及配套 provider 的持久化、验证、下一次调用取值和缓存失效。
- 常用 / 收藏 / 全部 / 搜索；账号池档位合并；聊天选择器共用目录投影和收藏。
- 默认设置草稿、明确保存 / 取消、版本检查、完整档位、持久化读回。
- API 来源展示实际地址和凭据配置状态；已有连接可编辑，保留原有模型及兼容参数。
- 窄面板换行、主题继承；移除外部导航 CSS 干预。

## 实际验证

- Model Console 的 Codex 搜索结果数 8 → 9 保存后，插件页立即读到 9；恢复 8。
- 默认 Flash High → Medium；编辑期间“刷新状态”没有覆盖 Medium 草稿。保存后浏览器刷新和服务重启仍显示 Medium，新会话入口显示 Medium；最后恢复 Flash High。
- 收藏 Sonnet 后，原生 settings.describe 读到持久化收藏；最后恢复空收藏。
- Claude 无效相对工作目录被服务器拒绝，草稿和错误信息保留，原值未改。重试次数 0 → 1 保存及读回成功，最后恢复 0。
- 两个 API 来源均在真实页面发起短推理：本机 Flash High 首字 10199ms / 总耗时 10281ms；188 Flash Medium 首字 4226ms / 总耗时 4405ms。两者均成功，未创建聊天记录。
- 原生 session.list 在测试前后均为 24 个，运行中会话为 0。
- 320px 内容面板：scrollWidth = width = 320，保存按钮在面板边界内；常规内容面板 556px 同样无裁切。368px 面板也验证了换行。
- 浅色 / 深色实际页面均检查；外观恢复“跟随系统”。浏览器尺寸覆盖已清除。
- 22 个 Model Console 测试通过（使用 DSH_INSTALL_ROOT 运行），包括无设置、只读、缺版本、冲突、并行保存、错误读回、目录投影和真实 Host 选择函数。
- 配套 CLI 插件 154 个测试通过，包括 SDK 边界的设置快照、缓存失效和探测超时。构建及 TypeScript 检查通过。

## Codex 目录与真实调用修复

- 原目录来自插件固定 GPT-5.6 清单；现读取本机原生 Codex 的 models_cache.json，按推荐优先级同步可见型号与真实推理档位。常用页显示前四个，全部页保留八个。
- 当前前四个为 GPT-6.1 Sol、GPT-6 Astra、GPT-6 Sol、GPT-6 Luna。隐藏/internal 型号不会进入选择器。
- 原来 DSH 使用包内 0.147.0，而状态页检查桌面 0.159.0-alpha.12.1。旧引擎通过 Clash 调用 GPT-6.1 时返回 HTTP 400 / model not supported。现本机明确配置使用桌面新版 executable，并核对 CLI 与 App Server 握手版本。
- Codex 原来没有代理环境，直连 ChatGPT 返回证书主机名不匹配；通过现有 Clash 7897 连接成功。统一设置页增加 Codex 网络代理，已保存 http://127.0.0.1:7897。设置变化加入缓存 epoch，下一次请求重建进程。
- 真实 Model Console 测试：GPT-6.1 Sol low 首字 7493ms / 总耗时 7582ms，GPT-6 Astra low 首字 6862ms / 总耗时 6945ms，均成功。
- 测试截止由 30 秒调整为可配置 90 秒；本页触发的超时报告 TEST_TIMEOUT，保留上游真实额度错误，不再误报为用户主动 ABORTED。
- 模型目录来源变化、隐藏模型过滤、兼容副本、网络代理验证、真实进程配置、缓存代理切换和测试超时均有回归覆盖。原生目录/登录文件不修改。

## 明确限制

- 当前 DSH 运行路径未找到 claude，Claude 卡片明确显示未检测到安装 / 待检查；此次没有安装新 CLI 或修改登录。
- AG Pool 的实际账号、额度百分比和真实接力元数据仍通过 Pool 管理查看。当前 Pi 适配器没有向本页提供完整响应头，界面不伪造这些信息。
- 通用 API 来源创建继续使用原生“模型”页。此版本编辑现有来源，不复制传输实现。
- 本次改版部署在本机 DSH 和 dsh.vyibc.com（95 机器）。188 的推理连通性已验证；这不表示在 188 新部署了 DSH Model Console。

## 新会话默认值与远程同步

- 原 Task Console 兼容补丁保留所有 AgentOptions，误把普通 Web 空白会话创建时的默认模型当成明确选择；“新会话”复用该空白会话时仍显示旧模型。
- Model Console 提供版本锁定、幂等且失败关闭的 host:patch。仅给 Web 创建的默认 AgentOptions 标记归属；普通空白会话读取最新默认值，插件直接创建的 Agent 保留其模型，已有请求记录及用户手动选择仍优先。
- 保存默认设置后刷新当前聊天目录，只读取 session.models，不对已有会话执行 selectModel。
- 本机实际点击新会话显示 Codex / GPT-6.1-Sol / medium；同一空白会话改默认为 Astra/low 后读取 Astra，恢复后读取 Sol/medium。
- 95 机器在运行中会话为零时备份并部署固定 SHA256 插件包。其 2114 个原有会话、登录凭据、Task 数据及自定义 Codex Studio 来源保留。
- 远程运行使用已有 Codex 0.159.2 与 Clash http://127.0.0.1:7890；Model Console 来源页能查看代理配置。GPT-6.1-Sol low 实际测试首字 6316ms、总耗时 6469ms，通过。
- 远程测试空白会话默认为原有 codex-studio-director/gpt-6-astra；保存 Codex Sol/medium 后，同一空白会话读取该值。最后恢复远程原默认并归档测试空白会话。
- 发布包与备份：~/.dsh/releases/model-console-20261003、~/.dsh/backups/model-console-20261003。systemd ExecStartPre 显式传入 DSH_INSTALL_ROOT，在服务启动时确保补丁存在。
