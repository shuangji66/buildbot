# buildbot · fnOS 应用构建工作区

本项目是 [shuangji66/Fndepot](https://github.com/shuangji66/Fndepot)（飞牛 fnOS 应用市场）背后的**构建机器人**：用 GitHub Actions 把第三方应用源码 / 二进制自动打包成 fnOS 可安装的 `.fpk` 应用包，发布到 Fndepot Release，并回写 `fnpack.json` 市场清单。它只负责“构建 + 打包 + 发布”，本身不是某个具体应用。

- 每个子目录 = 一个 fnOS 应用模板（manifest、Cmd、Wizard、UI 等）
- 每个 `.github/workflows/<App>.yaml` = 对应应用的“下载上游 → 交叉编译 → 打包 → 发布”流水线
- 模板的 `manifest` / `fnpack.json` 均以 `${PLACEHOLDER}` 占位符书写，由工作流在构建时注入真实值

---

## 📁 目录结构

```
buildbot/
├── .github/workflows/           # 每个应用一个打包流水线
│   ├── <App>.yaml               # 具体应用的 build+publish 流水线（手动触发）
│   ├── Publish.yaml             # 可复用发布模块（workflow_call）
│   ├── Manual-Publish.yaml      # 手动补写/更新 fnpack.json 中某应用的发行记录
│   └── Build-<Something>.yaml   # 上游二进制/源码构建（如 aria2、nginx、openresty）
├── fnpack/                      # fnOS 应用模板 + fnpack 打包工具
│   ├── <App>/                   # 某个应用的打包模板
│   │   ├── manifest             # 应用信息（占位符 ${VERSION} ${PLATFORM} ${CHANGELOG}...）
│   │   ├── config/              # resource / privilege 等配置
│   │   ├── cmd/                 # 安装/升级/卸载/启停 生命周期脚本
│   │   ├── wizard/              # 安装/升级/卸载向导
│   │   ├── app/                 # 应用本体、UI、server
│   │   └── ICON*.PNG            # 应用图标
│   ├── fnpack-1.2.3-linux-amd64 # fnpack 打包工具二进制（版本随模板演进）
│   └── fnpack-1.2.3-linux-arm64
├── README.md                    # 本文件
└── LICENSE
```

> 术语提醒：目录名 `fnpack/` 是打包工具的“业务名”，里面还装着同名 CLI 二进制 `fnpack-1.2.3-linux-*`；两者同名但无冲突——模板放在 `fnpack/<App>/`，工具放在 `fnpack/fnpack-*`。

---

## ⚙️ fnpack 打包工具

工作流用 `buildbot_repo/fnpack/fnpack-1.2.3-linux-{amd64,arm64}` 编译打包。

```bash
./fnpack --help
./fnpack create <AppName> --template native|docker   # 新建应用模板
./fnpack build <AppName> -d <目录>                    # 打出一个 .fpk
```

重点：**工作流中所有 `fnpack-1.2.x` 引用必须与仓库内实际的 fnpack 二进制版本保持一致**。升级 fnpack 时，要在**所有** `.yaml` 里同步改版本号，并替换 `fnpack/fnpack-*` 二进制，避免引用不存在的资产。

---

## 🚀 工作流如何工作（以 <App> 为例）

每个应用的流水线大体一致，按顺序完成：

1. **workflow_dispatch 输入**：上游版本 `version`、manifest 版本 `manifest_version`、`changelog`（支持中文）、`publish`（是否发布到 Fndepot Release）。
2. **set_vars**：注入 `APP_NAME`、下载地址模板（`${PLATFORM}` / `${arch}` / `${version}` 占位符）、二进制名等。
3. **确定性架构**：把矩阵的 os 映射成平台标识（`x86`/`arm`）与架构（`amd64`/`arm64`）。
4. **矩阵构建**（`ubuntu-24.04` → x86，`ubuntu-24.04-arm` → arm）：
   - 下载上游源码/二进制（或先在容器里编译），按需 `strip`；
   - 检出本工作区，把 `fnpack/<App>` 模板复制进构建目录；
   - `cp fnpack/fnpack-1.2.3-linux-$ARCH build_workspace/fnpack && chmod +x`；
   - `sed` 把 manifest / wizard 里的 `${VERSION}` `${CHANGELOG}` `${MANIFEST_VERSION}` `${PLATFORM}` 占位符替换成真实值；
   - `./fnpack build <App>` 生成 `.fpk`，重命名为 `<App>-<manifest_version>-<platform>.fpk`；
   - 上传为 artifact（`fpk-x86` / `fpk-arm`）。
5. **输出共享**：`build` job 通过 `outputs` 把 `app_name`、`manifest_version`、`changelog` 传给发布 job。
6. **Publish job**：`needs: build` + `if: inputs.publish == 'true'`，`uses: ./.github/workflows/Publish.yaml` 复用发布逻辑——下载两个架构 artifact，`gh release` 创建/更新 Fndepot Release 并上传 `.fpk`，然后调用 `gh api` 解析各架构资产 digest/size，用 `jq` 写回 `fnpack.json` 的 `releases`。

---

## 🧩 一次性应用（如本地局域网/国人向应用）

凡不需要发布到 Fndepot 的本地向应用（如 `guandan`、`Tomato` 等），工作流相应简化：

- manifest 用本地 `desc` 描述、`distributor`/`maintainer` 直接写作者信息；
- 交互向导经 `wizard/`，生命周期经 `cmd/`（如 `main` 负责 `start`/`stop`，写 `app.pid`、日志到 `target/var`）；
- 版本号常以日期/上游 tag 为准。

---

## ➕ 新增一个应用

1. 建模板目录 `fnpack/<AppName>/`，参照已有模板补齐 `manifest`、`config/`、`cmd/`、`wizard/`、`app/`、图标。
2. 复制最接近的现有工作流为 `.github/workflows/<AppName>.yaml`，只改：
   - `workflow_dispatch` 的输入描述；
   - `set_vars` 里的 `APP_NAME`、下载地址模板、上游仓库/版本；
   - 若走独立发布，用 `.outputs` 接好 `app_name`/`manifest_version`/`changelog`。
3. 如需进 Fndepot 市场，把应用名/版本写入目标市场的 `fnpack.json`（或跑 `Manual-Publish.yaml`）。

---

## 🛠️ 本地复现 / 开发

工作流在 GitHub 托管 runner 上跑，本地复现顺序：

```bash
# 1) 确定架构，准备文件夹
mkdir -p build_workspace && cp -r fnpack/<App> build_workspace/

# 2) 放入 fnpack 工具（版本必须与工作流一致）
cp fnpack/fnpack-1.2.3-linux-amd64 build_workspace/fnpack
chmod +x build_workspace/fnpack

# 3) 注入占位符（示例，实际按各应用 manifest 定义）
export VERSION=... MANIFEST_VERSION=... CHANGELOG=... PLATFORM=x86
sed -i "s/\${VERSION}/$MANIFEST_VERSION/g; s/\${CHANGELOG}/.../g" build_workspace/<App>/manifest

# 4) 打包
cd build_workspace && ./fnpack build <App> && ls *.fpk
```

> 提示：占位符书写为 `${VERSION}`。在 `sed` 表达式中记得转义为 `\${VERSION}`，避免被 shell 展开。

---

## 🤖 AI 代理 / 协作者约定

新贡献者（或 AI 代理）请先阅读 [AGENTS.md](AGENTS.md)：它记录了本仓库的全部约定——占位符替换、fnpack 版本同步、架构映射、发布模式、提交规范等，避免改坏打包流水线。

---

## 📄 许可

本项目各应用形态各异，但构建流水线与模板遵循仓库根 [LICENSE](LICENSE)。
