# Pixel Code Lab · 像素编程挑战

面向已学习 Python 函数与条件判断的学生，在 Windows 现代 Edge/Chrome 中观察目标像素图、写代码复现图案。

## 启动
环境：Node.js 24、npm。
```powershell
cd D:\pixel-code-lab
npm install
npm run dev
```
打开终端显示的地址。Monaco 编辑器与 Pyodide 文件均由本站提供，无运行时第三方 CDN。Python 文件在启动/构建前从 npm 包复制至 public/pyodide，不纳入 Git。首次加载 Python 不计入代码的 2 秒执行时限。

## 功能
- 三个独立关卡全部开放，原点对称且尺寸按关配置。
- Monaco Python 编辑器：语法着色、行号、缩进、查找、执行错误标记。
- Pyodide Worker 真实运行、停止、超时终止及重建、加载失败重试。
- Canvas 目标与作品上下展示，共享滚轮缩放、拖动平移、按钮缩放及重置视图。
- 悬停按当前视图准确查询坐标与颜色，范围外不误报边缘格子。
- 运行即显示匹配率，完全一致通关；双方空白不计分，无解题提示或错误格定位。
- 每关代码、历史通关、上次关卡和首次说明状态保存在当前浏览器。
- 刷新恢复代码与进度，作品需重新运行；切关/离开页面及时保存，普通编辑防抖保存。
- 存档损坏保留原数据，用户确认后可用当前进度覆盖；存储不可用时明确提示且不阻断练习。
- 首次说明可关闭/再次打开；恢复初始代码需确认，保留历史通关。

## 检查
- npm run build：复制 Python 文件、TypeScript 检查、生产构建。
- npm run lint：静态检查。
- npm test：构建并启动生产预览，在本机 Microsoft Edge 上运行 Playwright 测试（需安装 Edge）。
- npm run preview：预览已生成的生产构建。

存档键为 pixel-code-lab.progress，schemaVersion=1。无账号和跨设备同步；清理浏览器数据会移除存档。不同本地端口属于不同来源，不共享存档。缩放/平移是临时视图，切关恢复默认，不写入存档。

Python Worker 用于隔离普通执行，不是恶意代码的完整安全边界；不自动安装额外 Python 包。Monaco 是按需加载的独立资源，首次进入编辑器需要下载。当前没有完整 Python 静态语言服务，错误行号来自实际运行。

完整规划见 docs/项目规划书.md，阶段记录见 docs/开发记录.md。仅本地 Git，无远程仓库。
