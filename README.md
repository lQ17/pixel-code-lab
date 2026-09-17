# Pixel Code Lab · 像素编程挑战

面向已学习 Python 函数与条件判断的学生，在 Windows 现代 Edge/Chrome 中观察目标像素图、写代码复现图案。

## 启动
环境：Node.js 24、npm。
```powershell
cd D:\pixel-code-lab
npm install
npm run dev
```
打开终端显示的地址。启动前自动从已安装的 pyodide 包复制运行文件至 public/pyodide，由本站提供，不依赖运行时第三方 CDN。首次浏览器加载仍需下载 Python/WebAssembly 文件；它们不计入代码的 2 秒执行时限。

## 已完成
- 三关独立配置与内存内代码/历史通关状态，目标和作品上下显示。
- Pyodide Worker 真实执行；Python 内部遍历；每次使用新的用户命名空间。
- 运行即 Canvas 绘图、匹配率、严格通关判定，空白不充数。
- 停止、2 秒超时终止、自动重建、加载失败重试、切关取消和过期结果丢弃。
- 语法/运行异常的真实用户行号；非法颜色、缺少函数提示；最多 4000 字符输出。
- 失败保留上次作品并标注历史结果，修改代码后也标记旧结果。
- 目标/作品悬停坐标查询，坐标轴、网格、颜色表；Tab 输入四空格。

## 后续
Monaco、两图联动缩放平移、本地保存、首次说明弹窗。当前编辑器为 textarea；刷新仍会清除代码及通关记录。当前阶段不是完整 V0.1。

## 检查
- npm run build：复制 Python 文件、TypeScript 检查、生产构建。
- npm run lint：静态检查。
- npm test：构建并启动生产预览，在本机 Microsoft Edge 上运行 Playwright 测试（需已安装 Edge）。包括三关真实执行、匹配规则、错误行号、非法返回、命名空间隔离、死循环超时、停止恢复、切关取消、加载失败重试。
- npm run preview：预览已生成的生产构建。

Python 执行无服务端，Worker 用于避免普通死循环阻塞页面，不是恶意代码的完整安全边界。暂不提供自动安装额外 Python 包。

完整规划见 docs/项目规划书.md；实现及验收记录见 docs/开发记录.md。本项目仅本地 Git，无远程仓库。
