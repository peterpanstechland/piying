#!/bin/bash

echo "========================================"
echo "紮急密码重置工具"
echo "Emergency Password Reset Tool"
echo "========================================"
echo ""

# Check if Python is available
if ! command -v python3 &> /dev/null; then
    echo "[错误] 未找到 Python"
    echo "[Error] Python not found"
    exit 1
fi

# Check if virtual environment exists
if [ -f "venv/bin/activate" ]; then
    echo "激活虚拟环境..."
    echo "Activating virtual environment..."
    source venv/bin/activate
fi

# Run the reset script
if [ -z "$1" ]; then
    echo "使用默认账号: admin / admin123"
    echo "Using default account: admin / admin123"
    echo ""
    python3 reset-admin-password.py
else
    python3 reset-admin-password.py "$1" "$2"
fi

echo ""
