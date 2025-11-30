#!/usr/bin/env python3
"""
Emergency admin password reset script.
Use this when you've lost access to all admin accounts.

Usage:
    python reset-admin-password.py [username] [new_password]
    
If no arguments provided, resets 'admin' to 'admin123'
"""
import sys
import os
import asyncio
import bcrypt
from pathlib import Path

# Add backend to path
backend_path = Path(__file__).parent / "backend"
sys.path.insert(0, str(backend_path))

from sqlalchemy import select, update
from app.database import async_session_maker, init_db
from app.models.admin.user import User


def hash_password(password: str) -> str:
    """Hash a password using bcrypt."""
    password_bytes = password.encode('utf-8')
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password_bytes, salt).decode('utf-8')


async def reset_password(username: str, new_password: str):
    """Reset a user's password."""
    # Initialize database
    await init_db()
    
    async with async_session_maker() as db:
        # Find user
        result = await db.execute(select(User).where(User.username == username))
        user = result.scalar_one_or_none()
        
        if user is None:
            print(f"❌ 用户 '{username}' 不存在")
            print(f"❌ User '{username}' not found")
            return False
        
        # Update password
        new_hash = hash_password(new_password)
        await db.execute(
            update(User)
            .where(User.username == username)
            .values(password_hash=new_hash)
        )
        await db.commit()
        
        print(f"✅ 密码重置成功！")
        print(f"✅ Password reset successfully!")
        print(f"   用户名 / Username: {username}")
        print(f"   新密码 / New Password: {new_password}")
        print(f"   角色 / Role: {user.role}")
        return True


async def main():
    """Main function."""
    # Parse arguments
    if len(sys.argv) >= 3:
        username = sys.argv[1]
        new_password = sys.argv[2]
    else:
        username = "admin"
        new_password = "admin123"
        print("⚠️  未提供参数，使用默认值")
        print("⚠️  No arguments provided, using defaults")
        print()
    
    print("=" * 60)
    print("紧急密码重置工具 / Emergency Password Reset Tool")
    print("=" * 60)
    print()
    print(f"目标用户 / Target User: {username}")
    print(f"新密码 / New Password: {new_password}")
    print()
    
    # Confirm
    if len(sys.argv) < 3:
        response = input("继续？(y/n) / Continue? (y/n): ")
        if response.lower() not in ['y', 'yes']:
            print("已取消 / Cancelled")
            return
    
    # Reset password
    success = await reset_password(username, new_password)
    
    if success:
        print()
        print("=" * 60)
        print("✅ 重置完成！现在可以使用新密码登录管理面板")
        print("✅ Reset complete! You can now login with the new password")
        print("=" * 60)
        print()
        print("管理面板地址 / Admin Panel URL:")
        print("http://localhost:8000/admin")
        print()
    else:
        print()
        print("=" * 60)
        print("❌ 重置失败")
        print("❌ Reset failed")
        print("=" * 60)
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
