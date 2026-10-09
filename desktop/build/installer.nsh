!macro customUnInstall
  ; Keep the current login during an in-app update. A real uninstall signs out.
  ${ifNot} ${isUpdated}
    Delete "$APPDATA\Chronexa\auth.json"
  ${endif}
!macroend
