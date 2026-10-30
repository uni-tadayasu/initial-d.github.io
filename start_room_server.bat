@echo off
chcp 65001 >nul
title 頭文字Dブラウザゲーム 部屋サーバー
cd /d "%~dp0"
where py >nul 2>&1
if %errorlevel%==0 (
  set "PYRUN=py -3"
) else (
  set "PYRUN=python"
)
echo [1/2] WebSocket通信ライブラリを確認・導入しています。
%PYRUN% -m pip install "websockets>=14,<18"
if errorlevel 1 (
 echo [ERROR] Python 3.11以上とpipが必要です。
 pause
 exit /b 1
)
echo [2/2] ローカル部屋サーバーを起動します（127.0.0.1:47817）
echo CTRL+C で終了します。
%PYRUN% room_server.py --host 127.0.0.1 --port 47817
pause
