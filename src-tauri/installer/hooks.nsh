; =============================================================================
; Sliders GL — NSIS Installer Hooks
; File   : src-tauri/installer/hooks.nsh
; Purpose: Branded installer — splash screen, custom install path,
;          Start Menu entry, Desktop shortcut.
; =============================================================================

!include "WinMessages.nsh"

!macro NSIS_HOOK_PREINIT
  InitPluginsDir
  File /oname=$PLUGINSDIR\splash.bmp "${__FILEDIR__}\splash.bmp"
  advsplash::show 2000 400 0 -1 $PLUGINSDIR\splash
  Pop $0
!macroend

!define ZGL_DEFAULT_INSTDIR "$LOCALAPPDATA\SlidersGL\Sliders GL"

Function OverrideInstDir
  ${If} $INSTDIR == ""
    StrCpy $INSTDIR "${ZGL_DEFAULT_INSTDIR}"
  ${EndIf}
FunctionEnd

; MUI_CUSTOMFUNCTION_GUIINIT must name an actual Function (it is called
; directly from .onGUIInit) — it cannot point at an NSIS !macro, which is
; just inline-expanded text and has no callable label of its own. Point it
; straight at OverrideInstDir instead of wrapping it in a same-named macro.
!define MUI_CUSTOMFUNCTION_GUIINIT OverrideInstDir

Function CreateStartMenuShortcut
  CreateDirectory "$SMPROGRAMS\Sliders GL"
  CreateShortcut  "$SMPROGRAMS\Sliders GL\Sliders GL.lnk" \
                  "$INSTDIR\Sliders GL.exe" \
                  "" \
                  "$INSTDIR\Sliders GL.exe" 0 \
                  SW_SHOWNORMAL \
                  "" \
                  "Open the Sliders GL real-time shader editor"
FunctionEnd

!macro NSIS_HOOK_POSTINSTALL
  Call CreateStartMenuShortcut
!macroend

Function CreateDesktopShortcut
  CreateShortcut "$DESKTOP\Sliders GL.lnk" \
                 "$INSTDIR\Sliders GL.exe" \
                 "" \
                 "$INSTDIR\Sliders GL.exe" 0 \
                 SW_SHOWNORMAL \
                 "" \
                 "Sliders GL — Real-time GLSL / WebGPU shader editor"
FunctionEnd

Section "Desktop Shortcut" SEC_DESKTOP
  SectionIn RO
  Call CreateDesktopShortcut
SectionEnd