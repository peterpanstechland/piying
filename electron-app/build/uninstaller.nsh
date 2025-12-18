; Custom uninstaller script - Clean all user data on uninstall

!macro customUnInstall
  ; Clean user data in APPDATA
  RMDir /r "$APPDATA\RobomonPiying"
  RMDir /r "$APPDATA\shadow-puppet-system"
  RMDir /r "$APPDATA\Electron"
  
  ; Clean user data in LOCALAPPDATA
  RMDir /r "$LOCALAPPDATA\shadow-puppet-system"
  RMDir /r "$LOCALAPPDATA\electron"
  
  ; Show message
  MessageBox MB_OK "All user data has been removed."
!macroend

