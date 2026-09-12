# AGENTS.md · 给 AI 代理 / 协作者的操作约定

本文件约束任何在本仓库改代码的代理（GitHub Copilot、Cline、Claude Code、或其他 AI / 走 code review 的维护者）。**先读 README.md 了解整体结构，再按下面的规则动手。** 这些规则来自仓库里 `53+` 个模板/工作流沉淀出的固定模式，违反它们会直接破坏打包装机。

---

## 🚨 最重要的两条（最容易踩坑）

### 1. fnpack 版本必须全仓一致，且与随附二进制一致

仓库把 fnpack 打包工具**以二进制白盒形式**放在 `fnpack/fnpack-1.2.3-linux-{amd64,arm64}`。工作流通过 `FNPACK_BIN` 变量引用它并 `cp ... build_workspace/fnpack`。

- 改版本号 = **改工具 + 改所有引用**，一个都不能漏。
- 当前锁定版本：**1.2.3**（随附 `fnpack-1.2.3-linux-amd64` / `fnpack-1.2.3-linux-arm64`）。
- 升级时用脚本全仓替换并核对，例如：
  ```bash
  # 把 1.2.3 → 新版本（仅示例，勿照抄执行）
  grep -rl "fnpack-1.2.3" .github/workflows/ | xargs sed -i 's/fnpack-1\.2\.3/fnpack-1.2.x/g'
  ```
  同时**必须**上传对应的新架构二进制到 `fnpack/`，并更新 `.github/workflows/Manual-Publish.yaml` 里对 `FNPACK_BIN` 的判断（如需）。
- 检查命令（提交前跑）：
  ```bash
  # 不应再有旧版本残留；新旧版本出现次数应一致
  grep -rn "fnpack-1.2.1\|fnpack-1.2.2" . --include="*.yaml" || echo "OK: 无旧版本残留"
  ls fnpack/fnpack-1.2.3-linux-*
  ```

### 2. 占位符用 `${XXX}`，替换时转义成 `\${XXX}`

模板文件里写的都是 `${VERSION}` `${CHANGELOG}` `${PLATFORM}` `${MANIFEST_VERSION}` 这类占位符。工作流里用 `sed` 替换，**涉及时要在 sed 里写成 `\${VERSION}`**，防止被 shell/GitHub 表达式提前展开。

---

## 📐 命名与大小写约定

| 场景 | 规则 | 示例 |
|------|------|------|
| 应用模板目录 | `fnpack/<App名>`（驼峰，目录名即工作流 `APP_NAME`） | `fnpack/9router` |
| 工作流文件 | `.github/workflows/<App名>.yaml` 或 `Build-<App>.yaml` | `9router.yaml` |
| 平台标识 | `x86` / `arm`（从 runner `ubuntu-24.04` / `-arm` 推导） | `PLATFORM=x86` |
| 架构标识 | `amd64` / `arm64` | 矩阵 `os` 决定 |
| 打包产物 | `<App>-<Vers>-<platform>.fpk` | `9router-1.2.0-x86.fpk` |
| fnpack 工具 | `fnpack/fnpack-1.2.3-linux-<amd64\|arm64>` | `fnpack-1.2.3-linux-arm64` |

---

## 🏗️ 新增/复制一个应用的流水线（照葫芦画瓢）

1. 复制**最像的现有工作流**（不要从零写）：
   - Go/静态工具：参照 `Git.yaml` → `Build-Nginx.yaml`（会 `strip`）；
   - Docker/脚本类：参照 `Publish.yaml` 调用方；
   - 上游带 .fpk 资产：参照 `Manual-Publish.yaml` 的资产解析段。
2. 只改这些（保持骨架/顺序/中文注释风格不变）：
   - `workflow_dispatch` 的 `inputs`（含 `version` / `manifest_version` / `changelog` / `publish`）；
   - `set_vars`：应用名、下载 URL 模板、二进制名、占位符数量；
   - 架构→平台映射；manifest 的 `sed` 替换；`fnpack build <App>` 的调用。
3. 骨架和注释**保持和现有工作流一致**（中文描述、`✅/❌/⚠️/ℹ️/🔄` 前缀、jq 写法），让整个仓库可 diff。
4. 应用模板的 `manifest` 里 `platform=${PLATFORM}`、`changelog=${CHANGELOG}`、`version=${VERSION}` 占位符**必须保留**，构建时由工作流填充。

---

## 📤 发布流程（如何进 Fndepot 市场）

- 每个应用工作流末尾（或单独 `Manual-Publish.yaml`）会把生成的 `.fpk`：
  1. `upload-artifact` 存 `fpk-x86` / `fpk-arm`；
  2. `gh release` 打到 `shuangji66/Fndepot` 的某个 Tag 上；
  3. 用 `gh api .../releases/tags/... --jq '.assets[]'` 拉每个架构的 `digest`(sha256) 和 `size`；
  4. `jq` 把 `{download_url, sha256, size}` 写进 `fnpack.json` 的 `apps.<App>.releases.<Vers>`，提交回 Fndepot 仓库。

**新应用/新市场变更**：先确认 `fnpack.json` 里已有对应 `apps.<App>` 键，否则发布段会因 `jq` 取值空而失败。

---

## 🔍 常见坑（提交前自查清单）

- [ ] `manifest`/模板里的 `${PLACEHOLDER}` 没被提前展开（看有没有 `\${` 转义）；
- [ ] `fnpack` 二进制版本与全仓 `FNPACK_BIN` 一致，且新旧版本无残留；
- [ ] 两个架构都要构建（`matrix` 里 `x86` 和 `arm` 都保留）；
- [ ] `.fpk` 重命名用的是 `${{ matrix.platform }}` 而不是架构；
- [ ] 新增的 `secrets`（`BUILDBOT` / `BUILDBOT_*`）在工作流和仓库 Settings → Secrets 都注册；
- [ ] 中文注释/日志风格与邻近工作流一致；
- [ ] 提交信息用 `<动作>: <应用/修改>（中文）` 而非英文默认。

---

## 🧹 其他

- 不要改动 `Publish.yaml` / `Harness.yaml` 的口径，除非同时更新所有依赖它的调用方。
- 图标统一 `ICON.PNG` / `ICON_256.PNG`（或 `ICON_256.PNG`）；`app/` 子目录与 fnpack 模板的 `app/ui`、`wizard/` 结构遵循 fnpack 工具约定。
- 本工作区文件用 UTF-8 + LF；YAML 用 2 空格缩进。
