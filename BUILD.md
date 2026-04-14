# GitZip Pro 构建系统

## 概述

此构建系统用于将GitZip Pro Chrome扩展的源代码进行压缩、混淆，并生成生产版本。

## 文件结构

- `source/` - 源代码目录
- `build/` - 构建输出目录
- `build.js` - 构建脚本
- `package.json` - npm配置和脚本

## 构建流程

构建脚本执行以下操作：

1. **清理** - 删除旧的build目录
2. **图标复制** - 复制所有图标文件
3. **JavaScript压缩** - 使用Terser压缩和混淆JavaScript文件
4. **CSS压缩** - 使用CleanCSS压缩CSS文件
5. **HTML压缩** - 使用html-minifier压缩HTML文件
6. **JSON处理** - 格式化JSON文件（如manifest.json）
7. **其他文件** - 直接复制其他文件

## 使用方法

### 安装依赖
```bash
npm install
```

### 运行构建
```bash
npm run build
```

### 清理构建
```bash
npm run clean
```

### 完整流程（清理+构建）
```bash
npm run build
```
这会自动运行`prebuild`脚本（即`npm run clean`）

## 构建脚本详情

### JavaScript压缩配置
- 压缩级别：高级压缩
- 混淆：启用（保留chrome、browser等全局变量）
- 移除debugger语句
- 保留console语句用于调试
- ECMAScript 2020兼容

### CSS压缩配置
- 级别2优化
- 兼容所有浏览器

### HTML压缩配置
- 折叠空白
- 移除注释
- 移除冗余属性
- 压缩内联CSS和JavaScript

## 输出

构建后的文件位于`build/`目录，包含：
- 压缩后的JavaScript文件（`.js`）
- 压缩后的CSS文件（`.css`）
- 压缩后的HTML文件（`.html`）
- 格式化的manifest.json
- 图标文件（`icons/`目录）

## 注意事项

1. `jszip.min.js`已经是压缩版本，构建脚本会直接复制而不进行额外压缩
2. 构建脚本会保留必要的全局变量（如`chrome`、`browser`、`window`等）
3. 如果压缩过程中出现错误，脚本会回退到直接复制源文件
4. 构建过程会显示每个文件的压缩比例

## 扩展加载

要在Chrome中加载构建后的扩展：
1. 打开Chrome，进入`chrome://extensions/`
2. 启用"开发者模式"
3. 点击"加载已解压的扩展程序"
4. 选择`build/`目录

## 版本管理

建议在发布新版本前：
1. 更新`source/manifest.json`中的版本号
2. 运行`npm run build`生成新版本
3. 测试构建后的扩展
4. 将`build/`目录打包为ZIP文件用于发布