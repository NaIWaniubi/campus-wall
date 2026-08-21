@echo off
echo ============================================================
echo  校园墙 better-sqlite3 原生模块 ABI 修复脚本
echo  当前 Node: 22.x (NODE_MODULE_VERSION 127)
echo  问题: 预编译模块基于 Node 137, require 即报错
echo ============================================================
echo.

echo [1/2] 修复 E:\校园墙 ...
cd /d "E:\校园墙"
call npm rebuild better-sqlite3
if errorlevel 1 (
  echo   rebuild 失败, 尝试强制重装...
  call npm install better-sqlite3 --force
)
echo.

echo [2/2] 修复 C:\Users\chen\Desktop\校园墙\server ...
cd /d "C:\Users\chen\Desktop\校园墙\server"
call npm rebuild better-sqlite3
if errorlevel 1 (
  echo   rebuild 失败, 尝试强制重装...
  call npm install better-sqlite3 --force
)
echo.

echo ============================================================
echo  修复完成。验证方式:
echo  - E盘:  cd /d E:\校园墙 ^&^& node -e "import('better-sqlite3').then(m=>{const db=new m.default(':memory:');db.exec('create table t(x)');console.log('OK')})"
echo  - Desktop: cd /d C:\Users\chen\Desktop\校园墙\server ^&^& npm test
echo ============================================================
pause
