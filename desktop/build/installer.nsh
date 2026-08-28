!macro customUnInstall
  ; A reinstall should require authentication, while time/session history stays intact.
  Delete "$APPDATA\Chronexa\auth.json"
!macroend
