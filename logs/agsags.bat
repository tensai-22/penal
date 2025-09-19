Get-Process | Where-Object { $_.Path -like "*combined.log*" }
pause