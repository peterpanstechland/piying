@echo off
REM Build frontend for production (Windows)

echo Building Shadow Puppet Frontend for production...

cd frontend

REM Install dependencies
echo Installing dependencies...
call npm install

REM Run production build
echo Building production bundle...
call npm run build

REM Check if build was successful
if exist "dist\" (
    echo Frontend build successful!
    echo Build output: frontend\dist\
) else (
    echo Frontend build failed!
    exit /b 1
)

cd ..
echo Frontend build complete.
