' EduCenter Pro - Silent Launcher
' تشغيل النظام بدون ظهور أي شاشة سوداء على الإطلاق
Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
currentDir = fso.GetParentFolderName(WScript.ScriptFullName)

' تشغيل سيرفر الويب في الخلفية (نافذة مخفية تماماً)
WshShell.CurrentDirectory = currentDir
WshShell.Run "cmd /c npm run dev", 0, False

' الانتظار ثانيتين ونصف حتى يعمل السيرفر
WScript.Sleep 2500

' فتح النظام كنافذة تطبيق مستقلة ونظيفة
On Error Resume Next
WshShell.Run "msedge --app=http://localhost:5173", 1, False
If Err.Number <> 0 Then
    Err.Clear
    WshShell.Run "chrome --app=http://localhost:5173", 1, False
    If Err.Number <> 0 Then
        Err.Clear
        WshShell.Run "http://localhost:5173", 1, False
    End If
End If
