@echo off
REM ============================================================
REM  成长工作台 · 本地服务一键启动（供手机同WiFi访问）
REM  请用「右键 → 以管理员身份运行」，否则防火墙规则可能添加失败
REM ============================================================
SET PORT=8000
SET DIR=%~dp0

echo [1/3] 正在放行 Windows 防火墙端口 %PORT% ...
netsh advfirewall firewall delete rule name="GrowthWorkbench%PORT%" >nul 2>&1
netsh advfirewall firewall add rule name="GrowthWorkbench%PORT%" dir=in action=allow protocol=TCP localport=%PORT% >nul 2>&1
if %errorlevel%==0 (echo       防火墙已放行端口 %PORT%) else (echo       请确认是以「管理员身份」运行本文件)

cd /d "%DIR%"
echo [2/3] 正在启动本地服务 ...
echo       电脑本机访问:  http://localhost:%PORT%
echo       手机访问地址:  http://你的电脑局域网IP:%PORT%
echo       (查电脑IP: 另开 cmd 输入 ipconfig 找「IPv4 地址」)
echo [3/3] 服务运行中，手机连同一WiFi后打开上面的地址即可。
echo       如需停止，关闭此窗口即可。
echo ------------------------------------------------------------

python -m http.server %PORT%
if errorlevel 1 (
  echo python 未找到，尝试 py ...
  py -m http.server %PORT%
)
if errorlevel 1 (
  echo 仍未成功：请先安装 Python 或用完整路径，例如：
  echo C:\Users\MI\.workbuddy\binaries\python\versions\3.13.12\python.exe -m http.server %PORT%
)
pause
