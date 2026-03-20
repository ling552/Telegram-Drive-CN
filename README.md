# Telegram Drive

**Telegram Drive** 是一款开源、跨平台的桌面应用，可将你的 Telegram 账号变成无限、安全的云存储空间。基于 **Tauri**、**Rust** 和 **React** 构建。

原项目地址：https://github.com/caamer20/Telegram-Drive

![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20MacOS%20%7C%20Linux-blue)


![Auth Screen](screenshots/AuthScreen.png)

##  什么是 Telegram Drive？

Telegram Drive 使用 Telegram API，让你直接在 Telegram 服务器上上传、整理和管理文件。它把“已保存的消息”和你创建的频道当作文件夹，提供熟悉的文件管理界面来管理 Telegram 云端内容。

###  主要特性

*   **无限云存储**：利用 Telegram 强大的云端基础设施。
*   **高性能网格**：虚拟滚动可快速处理成千上万的文件。
*   **自动更新**：支持 Windows、macOS 和 Linux 的无缝更新。
*   **媒体串流**：无需下载即可直接播放音视频。
*   **拖拽上传**：直观的拖拽上传与文件管理。
*   **缩略图预览**：图片和媒体文件支持内联缩略图。
*   **文件夹管理**：创建“文件夹”（私有 Telegram 频道）整理内容。
*   **注重隐私**：API 密钥和数据仅保存在本地，无第三方服务器。
*   **跨平台**：原生支持 macOS（Intel/ARM）、Windows、Linux。

##  Screenshots

| Dashboard | File Preview |
|-----------|--------------|
| ![Dashboard](screenshots/DashboardWithFiles.png) | ![Preview](screenshots/ImagePreview.png) |

| Grid View | Authentication |
|-----------|----------------|
| ![Dark Mode](screenshots/DarkModeGrid.png) | ![Login](screenshots/LoginScreen.png) |

| Audio Playback | Video Playback |
|----------------|----------------|
| ![Audio Playback](screenshots/AudioPlayback.png) | ![Video Playback](screenshots/VideoPlayback.png) |

| Auth Code Screen | Upload Example |
|------------------|-------------|
| ![Auth Code Screen](screenshots/AuthCodeScreen.png) | ![Upload Example](screenshots/UploadExample.png) |

| Folder Creation | Folder List View |
|-----------------|------------------|
| ![Folder Creation](screenshots/FolderCreation.png) | ![Folder List View](screenshots/FolderListView.png) |

##  技术栈

*   **前端**：React、TypeScript、TailwindCSS、Framer Motion
*   **后端**：Rust（Tauri）、Grammers（Telegram Client）
*   **构建工具**：Vite


##  快速开始

### 先决条件
*   Node.js（v18+）
*   Rust（最新稳定版）
*   Telegram 账号
*   从 [my.telegram.org](https://my.telegram.org) 获取 API ID 和 Hash

### 安装

1.  **克隆仓库**
    ```bash
    git clone https://github.com/caamer20/Telegram-Drive.git
    cd Telegram-Drive
    ```

2.  **安装依赖**
    ```bash
    cd app
    npm install
    ```

3.  **开发模式运行**
    ```bash
    npm run tauri dev
    ```

4.  **构建/编译**
    ```bash
    npm run tauri build
    ```

##  开源与许可

本项目为**自由开源软件**，你可以自由使用、修改和分发。

遵循 **MIT License** 许可。

---
*免责声明：本应用与 Telegram FZ-LLC 无任何隶属关系。请遵守 Telegram 的服务条款并合理使用。*


<a href="https://www.paypal.me/Caamer20">
  <img src="https://raw.githubusercontent.com/stefan-niedermann/paypal-donate-button/master/paypal-donate-button.png" alt="Donate with PayPal" width="200" />
</a>
