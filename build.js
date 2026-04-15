#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// 导入压缩库
const Terser = require('terser');
const CleanCSS = require('clean-css');
const htmlMinifier = require('html-minifier');

// 配置
const SOURCE_DIR = 'source';
const BUILD_DIR = 'build';
const IGNORE_FILES = ['README.md'];

// 先清空旧的build目录（跨平台兼容)
if (fs.existsSync(BUILD_DIR)) {
  fs.rmSync(BUILD_DIR, { recursive: true, force: true });
  console.log('Cleaned existing build directory');
}

// 创建新的build目录
fs.mkdirSync(BUILD_DIR, { recursive: true });

// 复制icons目录
const iconsDir = path.join(SOURCE_DIR, 'icons');
const buildIconsDir = path.join(BUILD_DIR, 'icons');
if (fs.existsSync(iconsDir)) {
  if (!fs.existsSync(buildIconsDir)) {
    fs.mkdirSync(buildIconsDir, { recursive: true });
  }

  const iconFiles = fs.readdirSync(iconsDir);
  for (const file of iconFiles) {
    const srcPath = path.join(iconsDir, file);
    const destPath = path.join(buildIconsDir, file);
    fs.copyFileSync(srcPath, destPath);
    console.log(`Copied: ${file}`);
  }
}

// 处理文件
function processFile(filePath, relativePath) {
  const ext = path.extname(filePath).toLowerCase();
  const destPath = path.join(BUILD_DIR, relativePath);

  // 确保目标目录存在
  const destDir = path.dirname(destPath);
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  // 根据文件类型处理
  if (ext === '.js') {
    processJavaScript(filePath, destPath);
  } else if (ext === '.css') {
    processCSS(filePath, destPath);
  } else if (ext === '.html') {
    processHTML(filePath, destPath);
  } else if (ext === '.json') {
    processJSON(filePath, destPath);
  } else {
    // 直接复制其他文件
    fs.copyFileSync(filePath, destPath);
    console.log(`Copied: ${relativePath}`);
  }
}

// 处理JavaScript文件
async function processJavaScript(srcPath, destPath) {
  try {
    const code = fs.readFileSync(srcPath, 'utf8');

    // 如果是jszip.min.js，已经是压缩过的，直接复制
    if (path.basename(srcPath) === 'jszip.min.js') {
      fs.copyFileSync(srcPath, destPath);
      console.log(`Copied (minified): ${path.relative(BUILD_DIR, destPath)}`);
      return;
    }

    // 使用terser压缩
    const result = await Terser.minify(code, {
      compress: {
        drop_console: false, // 保留console语句用于调试
        drop_debugger: true,
        ecma: 2020,
      },
      mangle: {
        toplevel: true,
        reserved: ['chrome', 'browser', 'window', 'document', 'console']
      },
      format: {
        comments: false,
        ecma: 2020
      },
      sourceMap: false
    });

    if (result.error) {
      console.error(`Error minifying ${srcPath}:`, result.error);
      // 如果压缩失败，直接复制
      fs.copyFileSync(srcPath, destPath);
      console.log(`Copied (fallback): ${path.relative(BUILD_DIR, destPath)}`);
    } else {
      fs.writeFileSync(destPath, result.code);
      console.log(`Minified: ${path.relative(BUILD_DIR, destPath)} (${code.length} → ${result.code.length} bytes, ${Math.round((1 - result.code.length / code.length) * 100)}% reduction)`);
    }
  } catch (error) {
    console.error(`Error processing JavaScript ${srcPath}:`, error);
    // 出错时直接复制
    fs.copyFileSync(srcPath, destPath);
    console.log(`Copied (error fallback): ${path.relative(BUILD_DIR, destPath)}`);
  }
}

// 处理CSS文件
function processCSS(srcPath, destPath) {
  try {
    const css = fs.readFileSync(srcPath, 'utf8');
    const minified = new CleanCSS({
      level: 2,
      compatibility: '*'
    }).minify(css);

    if (minified.errors && minified.errors.length > 0) {
      console.error(`Error minifying CSS ${srcPath}:`, minified.errors);
      fs.copyFileSync(srcPath, destPath);
      console.log(`Copied (fallback): ${path.relative(BUILD_DIR, destPath)}`);
    } else {
      fs.writeFileSync(destPath, minified.styles);
      console.log(`Minified CSS: ${path.relative(BUILD_DIR, destPath)} (${css.length} → ${minified.styles.length} bytes, ${Math.round((1 - minified.styles.length / css.length) * 100)}% reduction)`);
    }
  } catch (error) {
    console.error(`Error processing CSS ${srcPath}:`, error);
    fs.copyFileSync(srcPath, destPath);
    console.log(`Copied (error fallback): ${path.relative(BUILD_DIR, destPath)}`);
  }
}

// 处理HTML文件
function processHTML(srcPath, destPath) {
  try {
    const html = fs.readFileSync(srcPath, 'utf8');
    const minified = htmlMinifier.minify(html, {
      collapseWhitespace: true,
      removeComments: true,
      removeRedundantAttributes: true,
      removeScriptTypeAttributes: true,
      removeStyleLinkTypeAttributes: true,
      useShortDoctype: true,
      minifyCSS: true,
      minifyJS: true
    });

    fs.writeFileSync(destPath, minified);
    console.log(`Minified HTML: ${path.relative(BUILD_DIR, destPath)} (${html.length} → ${minified.length} bytes, ${Math.round((1 - minified.length / html.length) * 100)}% reduction)`);
  } catch (error) {
    console.error(`Error processing HTML ${srcPath}:`, error);
    fs.copyFileSync(srcPath, destPath);
    console.log(`Copied (error fallback): ${path.relative(BUILD_DIR, destPath)}`);
  }
}

// 处理JSON文件（主要是manifest.json）
function processJSON(srcPath, destPath) {
  try {
    const jsonContent = fs.readFileSync(srcPath, 'utf8');
    const json = JSON.parse(jsonContent);

    // 对于manifest.json，我们可以确保格式正确
    const formatted = JSON.stringify(json, null, 2);
    fs.writeFileSync(destPath, formatted);
    console.log(`Processed JSON: ${path.relative(BUILD_DIR, destPath)}`);
  } catch (error) {
    console.error(`Error processing JSON ${srcPath}:`, error);
    fs.copyFileSync(srcPath, destPath);
    console.log(`Copied (error fallback): ${path.relative(BUILD_DIR, destPath)}`);
  }
}

// 遍历source目录
function walkDir(dir, callback) {
  const files = fs.readdirSync(dir);

  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    const relativePath = path.relative(SOURCE_DIR, filePath);

    // 跳过忽略的文件
    if (IGNORE_FILES.includes(file)) {
      continue;
    }

    if (stat.isDirectory()) {
      // 跳过icons目录（已经处理过）
      if (file === 'icons') {
        continue;
      }
      walkDir(filePath, callback);
    } else {
      callback(filePath, relativePath);
    }
  }
}

// 主函数
async function main() {
  console.log('Starting build process...');
  console.log(`Source: ${SOURCE_DIR}`);
  console.log(`Build: ${BUILD_DIR}`);
  console.log('---');

  // 遍历并处理所有文件
  walkDir(SOURCE_DIR, (filePath, relativePath) => {
    processFile(filePath, relativePath);
  });

  console.log('---');
  console.log('Build completed!');

  // 显示构建统计
  const buildFiles = fs.readdirSync(BUILD_DIR, { recursive: true });
  console.log(`Total files in build directory: ${buildFiles.length}`);
}

// 运行主函数
main().catch(error => {
  console.error('Build failed:', error);
  process.exit(1);
});