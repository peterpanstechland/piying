; Custom uninstaller script - Ask user whether to keep user data on uninstall
; 自定义卸载脚本 - 询问用户是否保留数据

!macro customUnInstall
  ; Ask user if they want to keep user data
  MessageBox MB_YESNO|MB_ICONQUESTION "Keep user data?$\n$\n保留用户数据？$\n$\nYes = Keep data$\nNo = Delete all" IDYES keepData IDNO deleteData
  
  keepData:
    ; User chose to keep data
    MessageBox MB_OK|MB_ICONINFORMATION "User data kept at:$\n$APPDATA\RobomonPiying"
    Goto done
  
  deleteData:
    ; User chose to delete all data
    RMDir /r "$APPDATA\RobomonPiying"
    RMDir /r "$APPDATA\shadow-puppet-system"
    RMDir /r "$APPDATA\Electron"
    RMDir /r "$LOCALAPPDATA\shadow-puppet-system"
    RMDir /r "$LOCALAPPDATA\electron"
    RMDir /r "$LOCALAPPDATA\shadow-puppet-system-updater"
    
    MessageBox MB_OK|MB_ICONINFORMATION "All user data removed."
    Goto done
  
  done:
!macroend
