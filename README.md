# Pixel Code Lab · 像素编程挑战

Windows + Node.js 24 + npm。

## 启动
```powershell
cd D:\pixel-code-lab
npm install
npm run dev
```
打开终端显示的本地地址。

- npm run build：类型检查并构建。
- npm run lint：静态检查。
- npm run preview：预览构建产物。

## 当前状态
仅初始化骨架，不代表V0.1完成。已包含三关配置、目标图预览、悬停坐标查询、代码输入区、关卡切换及颜色表。

待实现：Monaco、Pyodide Worker、Canvas联动、执行判定、停止与错误处理、本地保存、首次说明。当前使用textarea与CSS网格，运行按钮禁用；刷新会丢失代码，不模拟执行或通关。

完整需求见 docs/项目规划书.md。仅本地Git，未配置远程仓库。
