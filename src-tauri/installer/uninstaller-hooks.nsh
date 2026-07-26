; =============================================================================
; Sliders GL — NSIS Uninstaller Hooks
; File   : src-tauri/installer/uninstaller-hooks.nsh
; Purpose: Ask the user whether to also delete all Sliders GL app data
;          (localStorage, presets, window state, auto-save files, logs).
;
; Referenced via tauri.conf.json → bundle.windows.nsis.uninstallerHooks.
; =============================================================================

!include "MUI2.nsh"
!include "LogicLib.nsh"

; ── Known app-data paths ─────────────────────────────────────────────────────
; Tauri stores app data in:
;   %APPDATA%\com.patrickjaillet.slidersgl\          ← Tauri store, updater state
;   %LOCALAPPDATA%\com.patrickjaillet.slidersgl\     ← WebView2 user data (localStorage, cache)
;   %LOCALAPPDATA%\ZGL\                ← our custom install root

!define ZGL_APPDATA      "$APPDATA\com.patrickjaillet.slidersgl"
!define ZGL_LOCALDATA    "$LOCALAPPDATA\com.patrickjaillet.slidersgl"
!define ZGL_LOCALROOT    "$LOCALAPPDATA\SlidersGL"

; ── Confirmation dialog ───────────────────────────────────────────────────────
; Called from un.onInit — before any file removal — so the user can choose.

Var /GLOBAL RemoveAppData   ; "1" = yes, "" = no

Function un.AskRemoveAppData
  ; MessageBox with Yes/No.
  MessageBox MB_YESNO|MB_ICONQUESTION \
    "Do you also want to delete all Sliders GL application data?$\n$\n\
This includes saved presets, editor settings, cached shaders,$\n\
window state, auto-save files, and logs.$\n$\n\
If you keep them, they will be restored if you reinstall Sliders GL.$\n$\n\
Click YES to remove everything, NO to keep your data." \
    IDYES +2
  StrCpy $RemoveAppData ""
  Goto done
  StrCpy $RemoveAppData "1"
  done:
FunctionEnd

; ── Uninstaller init ──────────────────────────────────────────────────────────
Function un.onInit
  Call un.AskRemoveAppData
FunctionEnd

; ── Data removal ─────────────────────────────────────────────────────────────
; Called after the main uninstaller section has removed the program files.

Function un.RemoveAppDataIfConfirmed
  ${If} $RemoveAppData == "1"

    ; 1. Tauri store / updater state / crash reports
    RMDir /r "${ZGL_APPDATA}"

    ; 2. WebView2 user data partition — holds localStorage (presets,
    ;    MIDI mappings, shader library), IndexedDB, cookies, and disk cache.
    ;    The partition name is set by Tauri to the app identifier.
    RMDir /r "${ZGL_LOCALDATA}"

    ; 3. Custom install root (may already be empty after binary removal)
    RMDir /r "${ZGL_LOCALROOT}"

    ; 4. Start Menu folder
    RMDir /r "$SMPROGRAMS\Sliders GL"

    ; 5. Desktop shortcut
    Delete "$DESKTOP\Sliders GL.lnk"

    ; 6. Any pinned taskbar shortcut (best-effort; Windows manages these)
    ;    Removing the target .exe is enough — Windows cleans up broken pins.

    DetailPrint "All Sliders GL app data removed."

  ${Else}

    ; User chose NO — only remove shortcuts that point to the now-deleted exe.
    Delete "$SMPROGRAMS\Sliders GL\Sliders GL.lnk"
    RMDir  "$SMPROGRAMS\Sliders GL"          ; remove folder only if empty
    Delete "$DESKTOP\Sliders GL.lnk"

    DetailPrint "App data kept. Only program files and shortcuts were removed."

  ${EndIf}
FunctionEnd

; Hook into the post-uninstall callback.
Function un.onUninstSuccess
  Call un.RemoveAppDataIfConfirmed
FunctionEnd
