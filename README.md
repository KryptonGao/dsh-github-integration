# dsh-github-integration

外置的 DeepSeek Harness GitHub 工作区插件。它通过 `cordis.patch.yml` 作为 bundle 安装，Host 端负责 Git/GitHub/凭据，Client 端通过现有 sidebar、overlay、Settings 和 session slots 提供 UI。

## 本地开发

本包以 DeepSeek Harness 源码作为 peer/runtime 依赖。源码目录只读；构建所需的依赖安装和产物仅写入本工作区。

```sh
npm install
npm run build
```

在 Harness profile 中安装本包：

```sh
dsh plugin --profile web add /Users/chenkaigao/Documents/Program/DSH-GitHubIntegration
```

## GitHub App 配置

Settings 页面只保存 App ID、Client ID 和 Harness credential 引用；密钥、用户 access token、用户 refresh token 和 private key 均通过 Harness credentials 保存。默认 credential 引用为：

- `GITHUB_APP_CLIENT_SECRET`
- `GITHUB_APP_PRIVATE_KEY`
- `GITHUB_APP_USER_TOKEN`
- `GITHUB_APP_USER_REFRESH_TOKEN`

每个 Workspace 在 GitHub 面板中显式选择 `user` 或 `installation` 认证模式；installation 模式还需要填写 Installation ID。Host 端动态生成 installation token，并且不会把任何 token 返回给浏览器、写入插件状态文件或写入日志。若只配置 refresh token，Host 会在需要时通过 GitHub OAuth token endpoint 换取 user token，并尝试更新 Harness credential。

MVP 只支持公开 `github.com` 的 HTTPS/SSH `origin`，不支持 GitHub Enterprise。Issue → Session 使用首条用户消息传递经过长度限制并标记为不可信的外部内容；真正的一级导航和结构化 Session Metadata 不在当前 Harness slot API 范围内。
