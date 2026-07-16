<div align="center">

<img src="source/icons/icon128.png" alt="GitZip Pro" width="120" />

# GitZip Pro

[English](./README.md) | 简体中文

GitZip Pro 是一款受 **GitZip for GitHub** 启发而开发的 Chrome 扩展，并针对将选中的 GitHub 文件和文件夹下载为 ZIP 压缩包这一场景，提供了更多用户体验和工作流程方面的增强功能。

[![GitHub top language](https://img.shields.io/github/languages/top/fthux/GitZipPro?logo=github)](https://github.com/fthux/GitZipPro/commits/master/)
[![GitHub License](https://img.shields.io/github/license/fthux/GitZipPro?logo=github)](LICENSE)
[![Security](https://sonarcloud.io/api/project_badges/measure?project=fthux_GitZipPro&metric=security_rating)](https://sonarcloud.io/summary/new_code?id=fthux_GitZipPro)

[![Reliability](https://sonarcloud.io/api/project_badges/measure?project=fthux_GitZipPro&metric=reliability_rating)](https://sonarcloud.io/summary/new_code?id=fthux_GitZipPro)
[![Maintainability](https://sonarcloud.io/api/project_badges/measure?project=fthux_GitZipPro&metric=sqale_rating)](https://sonarcloud.io/summary/new_code?id=fthux_GitZipPro)
<!-- [![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=fthux_GitZipPro&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=fthux_GitZipPro) -->

[![Code Smells](https://sonarcloud.io/api/project_badges/measure?project=fthux_GitZipPro&metric=code_smells)](https://sonarcloud.io/summary/new_code?id=fthux_GitZipPro)
[![Vulnerabilities](https://sonarcloud.io/api/project_badges/measure?project=fthux_GitZipPro&metric=vulnerabilities)](https://sonarcloud.io/summary/new_code?id=fthux_GitZipPro)
[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/fthux/GitZipPro)

<img src="screenshots/banner_2.jpg" alt="GitZip Pro" />

</div>


## 安装

- [Chrome 浏览器](https://chromewebstore.google.com/detail/gitzip-pro/lpjpkopdlnpgcifigibaelbbkmigjjnp)

- [Brave 浏览器](https://chromewebstore.google.com/detail/gitzip-pro/lpjpkopdlnpgcifigibaelbbkmigjjnp)

- [Edge 浏览器](https://microsoftedge.microsoft.com/addons/detail/gitzip-pro/nhhmnccepdfgnekfhhchnbagljpifikg)

- [Firefox 浏览器](https://addons.mozilla.org/en-US/firefox/addon/gitzip-pro)

## 功能

### 核心下载体验

- 通过注入的复选框，直接在 GitHub 仓库页面选择文件和文件夹。
- 将选中的项目下载为 ZIP 文件，同时保留原有目录结构。
- 通过 Chrome 右键菜单集成，下载单个右键点击的文件或文件夹。
- 显示下载进度的悬浮下载按钮，支持状态切换（`idle`、`downloading`、`done`、`error`）。
- 自动处理 GitHub 的 SPA 页面导航（`turbo`、`pjax`、历史记录导航和路由变化）。

### 智能文件处理

- 通过 GitHub API 递归遍历文件夹。
- 支持并发控制的并行下载。
- 针对 GitHub API 限流和网络相关错误提供内置重试机制。
- 可选择在仓库文件列表中显示文件大小。
- 可配置通过双击选择文件行。

### 自动忽略规则

- 内置以下忽略规则分组：
  - Git/版本控制相关文件
  - 系统文件
  - 依赖项
  - 构建产物
  - 日志/临时文件
  - 图片
  - 视频
  - 压缩文件
  - 文档
  - 配置文件
- 预设忽略组合：`完整仓库`、`仅代码`、`仅文档`、`设计资源`、`最小化`。
- 支持用户自定义通配符忽略规则。
- 下载结果会在历史记录中包含被忽略文件的统计信息。

### 命名、通知与下载输出

- 支持使用以下变量配置 ZIP 命名模板：
  - `{owner}`、`{repo}`、`{branch}`、`{path}`、`{date}`、`{datetime}`、`{ts}`
- 提供预设命名策略和自定义命名输入。
- 可选择在下载完成时发送通知。
- 可选择在下载完成时播放提示音。
- 可选择在下载完成后自动打开下载位置。

### 主题和界面个性化

- 主题模式：`跟随系统`、`浅色`、`深色`。
- 支持强调色自定义（预设色板和自定义颜色选择器）。
- 可配置悬浮下载按钮的位置：
  - `右下`、`左上`、`右上`、`左下`
  - `顶部居中`、`底部居中`、`左侧居中`、`右侧居中`

### Token 与 API 访问

- 提供两种访问模式：
  - 匿名访问 GitHub API
  - 使用自定义 GitHub Token
- 支持通过 GitHub OAuth 授权流程（PKCE）访问：
  - 仅公开仓库
  - 公开仓库和私有仓库
- 支持 Token 显示/隐藏切换和复制到剪贴板。
- 内置 API 速率限制状态面板，并支持手动刷新。

### 下载统计与跟踪

- 全面的下载统计信息收集：
  - 选中、已下载和已忽略的文件数量
  - 详细记录被忽略文件的路径
  - 每条下载历史记录均保存统计信息
- 下载过程中实时显示统计信息。
- 可通过下载历史查看历史统计信息：
  - 查看每次下载中被忽略的文件列表
  - 快速查看包含分类明细的下载结果
- 统计信息可帮助用户了解忽略规则对下载结果的影响。

### 历史记录、关于与实用页面

- 下载历史页面支持按日期分组显示。
- 可展开查看记录详情（仓库、分支、路径、文件列表和被忽略文件）。
- 支持多选删除和清空全部历史记录。
- 关于页面显示版本，并提供检查更新功能。
- 提供问题反馈、评分和为 GitHub 仓库加星的快捷链接。
- 弹出窗口中的状态指示器会显示当前标签页是否为受支持的 GitHub 仓库页面。

## 截图

### GitHub 页面选择界面

![选择界面](./screenshots/0.jpg)

### 选项 - 通用

![通用选项](./screenshots/1.jpg)

### 选项 - 下载

![下载选项](./screenshots/3.jpg)

### 选项 - 历史记录

![历史记录选项](./screenshots/4.jpg)

### 选项 - Token 与速率限制

![Token 选项](./screenshots/2.jpg)

### 选项 - 统计

![统计选项](./screenshots/5.jpg)

### 选项 - 关于

![关于选项](./screenshots/6.jpg)

## 许可证

本项目采用 **GNU 通用公共许可证 v3.0**，并依据 GPL 第 7 节附加了强制署名要求。

加载本软件时，必须显著显示署名信息，包括作者姓名、项目名称和版权声明。

完整许可证详情请参阅：[LICENSE](./LICENSE)

## 反馈

如果您发现错误、有任何建议或希望提出功能请求，请在本仓库中提交 Issue。
