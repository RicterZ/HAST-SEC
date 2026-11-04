---
license: other
license_name: hast-sec-noncommercial-0.1
license_link: LICENSE
language:
  - zh
tags:
  - motion-control
  - vrm
  - text-to-motion
  - research
---

# HAST-SEC v0.1

各位路过的朋友们、未来的博士、院士、社会精英们点个star吧，球球了！

混合自适应语义时序骨骼控制与估计系统. 面向非商业学习和研究的本地交互演示, 支持中文聊天、已支持动作的语义控制、连续角色运动和实时曲线观察.

系统使用约0.8B的文本模型及小型运动模型. 本版只提供运行所需代码和资源, 不包含训练流程或原始训练视频.

本公开版为早期研究版本, 尚未完成完整的强化学习训练与应用适配, 不代表流明项目正式版的完整能力. 使用者需根据自身需求进一步学习、训练、适配和验证, 不应直接视为成熟产品. 我们将持续迭代流明项目正式版及HAST-SEC架构.

## 关于公司与合作

武汉光影流明科技有限公司专注虚拟具身智能、角色智能与互动内容研发, 探索语言理解、身体表现和互动叙事之间的连接, 面向创作者研究虚拟角色与互动世界.

我们正在寻求技术共研、应用落地、内容合作与商业授权合作, 同时寻求融资支持. 欢迎产业伙伴、研究团队及投资机构与我们交流.

公司官网: [武汉光影流明科技有限公司](https://47.113.224.57/company/)

合作与融资联系: [zhouzihuai@las-lumen.cn](mailto:zhouzihuai@las-lumen.cn)

![流明项目宣传图](docs/images/lumen-world.webp)

## 本版能做什么

- 通过中文聊天和已支持的动作指令与角色交互.
- 展示连续运动、局部动作控制、表情和自动翻页气泡.
- 查看最近15秒的运动曲线、姿态指标与实际资源占用.
- 在本机运行, 导入自己合法取得的兼容VRM角色.

本版不附完整训练工具链, 也不保证任意中文指令都能生成正确动作. 学习研究时可以修改运行代码与资源, 进一步训练需自行准备经过审核的数据和训练流程.

## 安装与启动

推荐Windows 10或11、Node.js 22以上和支持WebGL的现代浏览器. 初次安装需要网络和约2GB可用磁盘空间; 显卡加速安装需要更多空间. CPU可运行, 实际响应时间与硬件有关.

先从[版本页面](https://github.com/sola1039/HAST-SEC/releases)下载源码包并解压, 或克隆仓库:

```powershell
git clone https://github.com/sola1039/HAST-SEC.git
cd HAST-SEC
```

下载压缩包的用户, 在解压后包含package.json的目录打开终端. 先安装程序依赖:

```powershell
npm ci
```

然后选择一种运行资源安装方式. 没有兼容NVIDIA显卡时使用CPU方式:

```powershell
npm run setup
```

有兼容NVIDIA显卡及可用驱动时, 推荐使用显卡加速方式:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/setup.ps1 -Cuda
```

安装脚本会取得固定版本的语言权重、推理运行库和公开示例角色, 并校验文件. CPU与显卡方式无需同时安装. 安装完成后启动:

```powershell
npm start
```

打开 [http://127.0.0.1:8769/language-lab](http://127.0.0.1:8769/language-lab), 或使用终端打印的地址. 后续使用通常只需在同一目录执行npm start, 不必重复安装.

## 页面操作

页面默认暂停. 点击"开始或继续"后观察角色, 在底部聊天框输入消息并发送. 点击"暂停"停止回放并释放本程序启动的语言推理进程; "重置并暂停"回到初始状态. 终端中按Ctrl+C退出服务.

首次开始或聚焦聊天框时会加载和预热语言模型, 首条消息可能较慢. CPU响应通常明显慢于显卡加速. 输入一条指令后, 等待理解与动作结束再继续, 便于区分当前动作与下一条指令.

| 用途 | 可尝试的消息 |
|---|---|
| 日常聊天 | 你好、你今天怎么样、讲一个简短的故事 |
| 手臂动作 | 挥挥左手、把右手举高 |
| 腿部动作 | 抬起右腿 |

实时图表只保留最近15秒. 资源仪表显示内存和文件占用, 不是显存仪表. 暂停、首次加载、角色不同及硬件不同都可能影响显示结果.

## 角色与使用

默认使用pixiv公开示例角色, 许可和出处见THIRD_PARTY_NOTICES.txt. 视频中的角色文件不随本项目分发. 可用合法取得的兼容VRM角色导入本机:

```powershell
npm run avatar -- "D:\角色\自己的角色.vrm"
```

角色文件应在100MB以内, 包含完整人形、眼睛和手指骨骼. 导入后刷新页面; 只替换本机角色, 自有角色不会加入发布清单. 表情按角色实际支持的通道显示, 不同角色的形态和动作幅度可能不同.

### 用 profile 适配其他骨骼模型

不加 `--profile` 时导入流程和运行效果与官方完全一致. 非 VRM 的骨骼模型 (GLB) 或需要定制效果的 VRM, 可以写一份 JSON profile 后导入:

```powershell
npm run avatar -- "D:\角色\CH0069.glb" --profile configs/model_profiles/kivo.json
```

- `conversion` 只在导入 GLB 时使用: `humanBones` 把 HAST 骨骼名映射到模型节点名, `virtualBones` 为缺失的手指等骨骼补零长度子节点, `scale` 把模型单位换成米, `tPoseArms` 把 A-pose 手臂校准为 VRM 要求的 T-pose, `hideMeshes` 按节点名正则隐藏道具, `mouth` 可把与眼睛共用材质的嘴部拆出并使用外部嘴型贴图, `meta` 写入 VRM 元数据 (`{model}` 替换为文件名).
- `runtime` 嵌入导入后的角色并在页面中生效: `material` (`original`/`toon`), `lighting` (背景色、环境光、跟随相机的主光), `attachments` (把独立节点挂到人形骨骼上, 如光环跟随头部), `armCollision` (是否启用手臂碰撞), `bodyYawLimitDegrees` (限制待机等动作中身体偏离正前方的角度), `lookAtPointer` (鼠标在舞台上时头颈转向光标, 限制最大转角并平滑过渡, 移开后恢复原动作), `armPose` (手臂比例与训练骨架差异大时, 按动作名正则把手臂动作映射为手部目标点, 以肩为原点、手臂长度为单位), `mouthAtlas` (没有形态键、靠切换贴图格子做嘴型的角色: 为 `rules` 中的表情注册 VRM 表情通道, 每帧按顺序取第一条权重达到 `min` 的规则显示对应格子, 都未达到时显示 `neutral`).
- `extends` 可继承另一份 profile, 对象逐层合并, 数组整体替换. VRM 输入只嵌入 `runtime`, 不做转换.

`configs/model_profiles/kivo.json` 适用于 KivoWiki 的蔚蓝档案 3D 角色 (Bip001 骨架), 已用圣园未花、才羽桃井、白洲梓、栗村爱莉验证, 口型与情绪映射到 Kivo 共用的 8×8 嘴型图集; `configs/model_profiles/examples/kivo-mika.json` 演示在其基础上为单个角色换背景和挥手幅度. profile 只描述适配方式, 不授予模型的任何使用权利, 请遵守原始许可. `npm test` 检查 profile 解析与转换.

## 检查与常见问题

安装后可检查源码语法、本地依赖路径与配套运动资源:

```powershell
npm run check
```

| 现象 | 处理方式 |
|---|---|
| 找不到node或npm | 安装Node.js 22以上, 重新打开终端 |
| PowerShell阻止npm脚本 | 使用npm.cmd ci、npm.cmd run setup和npm.cmd start |
| 下载中断或校验失败 | 检查网络后重新执行安装命令, 已校验资源会跳过; 官方下载地址与目标位置见assets/resources.json |
| 页面无法连接 | 保持启动终端打开, 查看启动报错及实际地址 |
| 8769端口已占用 | 关闭自己之前启动的同一服务, 或在启动前设置$env:PORT='8779' |
| 中文推理端口已占用 | 启动前设置$env:HAST_LLM_PORT='8784', 再执行npm start |
| 中文回复很慢 | 等待首次加载完成, 核对是否使用CPU方式; 兼容NVIDIA显卡可改用-Cuda安装方式 |
| 角色加载失败或动作变形 | 使用完整骨骼的兼容VRM, 核对角色许可与骨架; 任意角色的重定向效果不作保证 |

## 文件与反馈

web为展示页面, service为本地服务, models和configs为配套运行资源与配置, tools提供安装、角色导入和检查工具. 其余目录包含骨骼、手部、表情及运行时处理代码; training目录中的文件是本版运行依赖, 不代表附带完整训练流程.

不需要外部API密钥. 安装资源需要联网, 中文推理在本机完成. 本版提供源码和运行资源, 不包含原始训练视频、私人配置、完整历史实验和原演示角色. 不用于机器人实体控制或其他安全关键场景.

问题请提交到[仓库议题](https://github.com/sola1039/HAST-SEC/issues), 附上系统、显卡、CPU或显卡运行方式、报错文字及复现步骤. 不要公开密码、访问令牌或无权分发的角色文件.

## 许可

本版本为公开源码的非商业学习研究版. 允许非商业学习、教学和研究用途的使用、复制与修改; 非商业再分发应保留许可与来源声明, 标明修改, 并遵守非商业限制. 商业产品、收费服务及商业部署需事先联系维护者获得书面授权.

完整条款: [项目许可证](LICENSE). 第三方资源独立遵守其原始许可: [第三方资源声明](THIRD_PARTY_NOTICES.txt). 项目授权不能替代第三方授权.

商用授权申请请通过[仓库议题](https://github.com/sola1039/HAST-SEC/issues)或上述公司联系邮箱沟通.

## 局域网访问

默认 `npm start` 仅监听 `127.0.0.1`。需要同一局域网的其他设备访问时，可指定监听地址：

```sh
HOST=0.0.0.0 npm start
```

PowerShell：

```powershell
$env:HOST="0.0.0.0"
npm start
```

在其他设备打开 `http://<运行电脑的局域网 IP>:8769/language-lab`；`0.0.0.0` 是监听地址，不能作为其他设备访问的目标地址。端口仍可通过 `PORT` 设置，也可将 `HOST` 设为某个具体的本机 IP。恢复默认时取消设置 `HOST`。

允许的 Host 包括本机地址；通配监听时还包括启动时检测到的网卡 IP。同源检查仍启用，不允许任意域名或跨站页面调用 API；网络地址变化后需重启服务。不提供登录认证，因此请仅在可信局域网开放，勿直接暴露到公网。语言推理使用服务端选择的后端。

局域网 HTTP 地址不属于浏览器安全上下文，通常没有 `crypto.subtle` 和 `crypto.randomUUID`。前端已提供 SHA-256 校验的 JavaScript 回退，并使用 HTTP 下仍可用的 `crypto.getRandomValues` 生成会话 UUID；不会跳过模型或技能资源摘要校验。localhost/HTTPS 下仍优先使用原生 Web Crypto。若旧版本通过 IP 打开后只显示空白角色区域，请更新代码、重启服务并强制刷新页面，无需关闭浏览器安全设置。

## DeepSeek 文字理解与对话

默认仍使用本地 Qwen3.5-0.8B。要改为 DeepSeek API，在启动服务的终端设置环境变量：

```sh
export HAST_LLM_PROVIDER=deepseek
export DEEPSEEK_API_KEY='你的 API Key'
# 可选，默认 deepseek-flash
export DEEPSEEK_MODEL=deepseek-flash
npm start
```

PowerShell：

```powershell
$env:HAST_LLM_PROVIDER='deepseek'
$env:DEEPSEEK_API_KEY='你的 API Key'
$env:DEEPSEEK_MODEL='deepseek-flash'
npm start
```

可同时设置 `HOST=0.0.0.0` 供局域网访问。修改变量后重启服务。密钥只由 Node 服务端读取，不放进网页、模型 profile 或提交到仓库。服务端请求官方 `https://api.deepseek.com/chat/completions`，发送当前文字、最近对话和动作能力提示；按 DeepSeek 的 API 规则计费。预热只检查配置，不发送付费请求，页面显示「已配置」不代表已验证密钥或网络。

API 模式不启动 llama-server，也不需要本地 Qwen GGUF；角色、动作模型和其他项目资源仍需保留。文字理解、聊天与主动对话都使用所选后端，角色 profile 和动作播放方式不变。API 返回 JSON 后先校验结构，再经过原有动作接口检查；失败、超时或取消时不执行新动作，也不自动切回本地模型。

DeepSeek 的 JSON 模式偶尔返回空内容；遇到空响应时，服务端会在原请求超时预算内自动重试一次（可能增加一次 API 计费），保留对话历史并加强 JSON 输出提示。若仍为空，错误会标明「动作理解」或「对话生成」阶段。鉴权失败、无效 JSON 和截断回复不会自动重试。

恢复本地模式：将 `HAST_LLM_PROVIDER` 设为 `qwen`（或取消该变量）后重启，使用原有 `configs/qwen_intent.json` 配置。`DEEPSEEK_MODEL` 可用于指定账户支持的其他 DeepSeek 聊天模型。请求显式关闭思考模式，避免短动作解析消耗长推理预算；使用 [JSON Output](https://api-docs.deepseek.com/guides/json_mode) 和 [thinking 参数](https://api-docs.deepseek.com/guides/thinking_mode) 的官方接口。
