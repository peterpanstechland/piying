@echo off
echo ========================================
echo 用户管理功能测试
echo ========================================
echo.

echo 1. 检查后端是否运行...
curl -s http://localhost:8000/ >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 后端未运行，请先启动后端服务
    echo 运行: start-backend.bat
    pause
    exit /b 1
)
echo [成功] 后端正在运行
echo.

echo 2. 测试登录 API...
curl -X POST http://localhost:8000/api/admin/auth/login ^
  -H "Content-Type: application/json" ^
  -d "{\"username\":\"admin\",\"password\":\"admin123\"}" ^
  -o temp_token.json
if %errorlevel% neq 0 (
    echo [错误] 登录失败
    pause
    exit /b 1
)
echo [成功] 登录成功
echo.

echo 3. 提取 token...
for /f "tokens=2 delims=:," %%a in ('type temp_token.json ^| findstr "token"') do set TOKEN=%%a
set TOKEN=%TOKEN:"=%
set TOKEN=%TOKEN: =%
echo Token: %TOKEN:~0,20%...
echo.

echo 4. 测试获取用户列表...
curl -X GET http://localhost:8000/api/admin/users ^
  -H "Authorization: Bearer %TOKEN%"
echo.
echo.

echo 5. 测试创建新用户...
curl -X POST http://localhost:8000/api/admin/users ^
  -H "Authorization: Bearer %TOKEN%" ^
  -H "Content-Type: application/json" ^
  -d "{\"username\":\"testuser\",\"password\":\"test123\",\"role\":\"operator\"}"
echo.
echo.

echo 6. 再次获取用户列表（应该包含新用户）...
curl -X GET http://localhost:8000/api/admin/users ^
  -H "Authorization: Bearer %TOKEN%"
echo.
echo.

echo 7. 清理临时文件...
del temp_token.json >nul 2>&1

echo.
echo ========================================
echo 测试完成！
echo ========================================
echo.
echo 请访问 http://localhost:8000/admin 查看管理界面
echo 默认账号: admin / admin123
echo.
pause
