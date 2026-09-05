' Runs start-collectr.cmd with no visible window (used from the Startup folder).
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
sh.Run "cmd /c """ & dir & "\start-collectr.cmd""", 0, False
