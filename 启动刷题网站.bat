@echo off
chcp 65001 >nul
title 国考刷题本 - 本地服务器
cd /d "%~dp0"
echo ============================================
echo   国考刷题本已启动！
echo   本机访问:  http://127.0.0.1:8642
echo   iPad/手机: http://%COMPUTERNAME%.local:8642  或见使用说明.md 中的局域网地址
echo   关闭本窗口即停止服务
echo ============================================
python -m http.server 8642 --bind 0.0.0.0
pause
