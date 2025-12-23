; Custom uninstaller script - Ask user whether to keep user data on uninstall
; 自定义卸载脚本 - 询问用户是否保留数据

!macro customUnInstall
  ; Ask user if they want to keep user data
  ; 询问用户是否保留用户数据
  MessageBox MB_YESNO|MB_ICONQUESTION "是否保留用户数据（角色、故事线、设置等）？$\n$\nDo you want to keep user data (characters, storylines, settings, etc.)?$\n$\n选择"是"保留数据，选择"否"删除所有数据。$\nChoose 'Yes' to keep data, 'No' to delete all data." IDYES keepData IDNO deleteData
  
  keepData:
    ; User chose to keep data - show confirmation
    ; 用户选择保留数据 - 显示确认信息
    MessageBox MB_OK|MB_ICONINFORMATION "用户数据已保留在以下位置：$\nUser data has been kept at:$\n$\n$APPDATA\RobomonPiying"
    Goto done
  
  deleteData:
    ; User chose to delete all data
    ; 用户选择删除所有数据
    
    ; Clean user data in APPDATA (Main user data directory)
    ; 清理 APPDATA 中的用户数据（主要用户数据目录）
    RMDir /r "$APPDATA\RobomonPiying"
    RMDir /r "$APPDATA\shadow-puppet-system"
    RMDir /r "$APPDATA\Electron"
    
    ; Clean user data in LOCALAPPDATA (Cache and temp files)
    ; 清理 LOCALAPPDATA 中的用户数据（缓存和临时文件）
    RMDir /r "$LOCALAPPDATA\shadow-puppet-system"
    RMDir /r "$LOCALAPPDATA\electron"
    RMDir /r "$LOCALAPPDATA\shadow-puppet-system-updater"
    
    ; Show completion message
    ; 显示完成信息
    MessageBox MB_OK|MB_ICONINFORMATION "所有用户数据已删除。$\nAll user data has been removed."
    Goto done
  
  done:
!macroend
