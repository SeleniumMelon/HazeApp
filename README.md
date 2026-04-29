# 手机端雾霾天气探测系统

一个适配手机端的雾霾天气探测 Web App，基于 Node.js + Express 后端和纯前端 HTML/CSS/JS 实现。

## 功能概述

- 手机端自适应页面设计，适配不同屏幕尺寸
- 浏览器 Geolocation 定位城市
- 定位失败时手动输入城市
- 将当前城市保存到后端服务器
- 查询天气详情与空气质量指数
- 使用 mock 数据模式保证无 API Key 时依然可演示
- 图表展示温度与湿度变化
- 根据 AQI 给出出行建议

## 目录结构

- `server.js`：后端服务入口
- `data.json`：简易数据库，保存定位城市和最新天气数据
- `public/index.html`：前端页面
- `public/style.css`：移动端样式
- `public/app.js`：前端逻辑和数据渲染
- `.env.example`：配置示例

## 运行步骤

1. 安装依赖：
```bash
npm.cmd install
```
2. 复制配置文件：
```bash
copy .env.example .env
```
3. 修改 `.env`：
- `USE_MOCK=true`：使用 mock 数据模式。
- `WEATHER_API_KEY=`：和风天气接口调用。
- `WEATHER_API_HOST=`：和风天气需要提供API HOST。
- `GEOCODE_API_KEY=`：百度地图反向地理编码。

4. 启动服务：
```bash
npm.cmd start
```
5. 打开浏览器访问：
```text
http://localhost:3000
```

## 项目说明

- 后端提供定位保存、当前城市获取、天气与空气质量查询接口。
- 前端通过百度地图 API 反向地理编码获取城市名。
- 如果定位失败，用户可手动输入城市名称。
- 系统保存当前定位城市，并用移动端友好的方式展示天气和 AQI 信息。
