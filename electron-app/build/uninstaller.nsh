; Custom uninstaller script - Clean application user data on uninstall

!macro customUnInstall
  ; Clean user data in APPDATA (uses productName from package.json)
  RMDir /r "$APPDATA\皮影互动系统"
  
  ; Clean user data in LOCALAPPDATA
  RMDir /r "$LOCALAPPDATA\皮影互动系统"
  RMDir /r "$LOCALAPPDATA\皮影互动系统-updater"
  
  ; Note: Do NOT delete $APPDATA\Electron - it's shared by all Electron apps
!macroend
