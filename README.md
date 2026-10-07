# Solovs

Solovs 是使用原生 JavaScript、Canvas 2D 和 Tiled 地图编写的单人 BOSS 对战游戏。当前版本提供移动、近战、翻滚，以及带两阶段和多种技能的 BOSS 战。

## 运行

游戏在浏览器中运行，需要支持 ES Modules 的现代浏览器和 HTTP 服务，无需 Node 后端或 npm 安装。在项目目录运行：

```powershell
python -m http.server 5177 --bind 127.0.0.1
```

浏览器访问 **http://127.0.0.1:5177/**，按 `Ctrl+C` 停止服务。此启动方式需要 Python 3，也可使用其他静态 HTTP 服务。

## 操作

- 右键地面：移动并脱战。
- 右键 BOSS：接战，进入距离后自动攻击。
- Q：立即触发近战攻击。
- W / E：技能预留。
- Space：沿最后移动方向翻滚。
- Esc：打开或关闭暂停菜单。
- Back game：继续当前对局。
- Return menu：通过 GameHub 游玩时返回门户首页；独立运行时返回游戏入口并重新开始。未结束的对局会先确认离开。

## 项目结构

| 目录 | 作用 |
| --- | --- |
| `src/` | 游戏逻辑、渲染、输入、加载和参数 |
| `assets/` | 图片、地图、运行配置及图集 |
| `tools/` | 配置生成与图集打包工具 |

浏览器直接加载已生成的运行配置和图集。开发辅助工具的 Node 版本固定为 **26.10.0**，见 `.node-version` 和 `package.json`；Python 生成工具使用 openpyxl 和 Pillow。
