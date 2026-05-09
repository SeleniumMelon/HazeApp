# 手机端雾霾天气探测系统

## 简介

HazeApp 是一个面向手机端的雾霾天气探测系统，用于查询和展示当前城市的天气信息与空气质量情况。

系统由 Node.js + Express 后端和 HTML/CSS/JavaScript 前端组成。用户可以通过浏览器或手机 App 访问页面，系统会根据定位或手动输入的城市获取天气详情、空气质量指数、PM2.5、PM10、温湿度等信息，并在页面中展示空气质量等级和出行建议。

项目同时支持普通 Web 页面访问和 Android App 打包运行。Android 端基于 Capacitor 构建，复用 `public` 目录中的前端页面。

## 使用方法

### 1. 安装依赖

进入项目目录后执行：

    npm install

如果是在 Windows 环境中，也可以使用：

    npm.cmd install

### 2. 配置环境变量

复制 `.env.example` 文件，并重命名为 `.env`, 并修改相关配置

Windows 环境：

    copy .env.example .env

Linux、macOS 或 WSL 环境：

    cp .env.example .env

### 3. 启动项目

执行：

    npm start

Windows 环境也可以使用：

    npm.cmd start

启动成功后，在浏览器中访问后端ip即可使用

### 4. Android App 运行

项目使用 Capacitor 构建 Android 应用。

同步前端代码到 Android 项目：

    npx cap sync android

打开 Android Studio：

    npx cap open android

然后可以在 Android Studio 中运行项目，或者构建 APK。

如果 Android App 需要访问电脑上的后端，不能使用 `localhost`，需要在前端配置实际的后端地址。例如在 `public/config.js` 中设置：

    window.HAZE_API_BASE_URL = '后端部署的ip地址';