# Export / View Waitlist Signups

Retrieve the list of users who have joined the Reeltrix waitlist.

## Command
Run this in PowerShell to display waitlist signups in chronological order:
```powershell
Get-Content d:\2026\reel_studio\waitlist.json | ConvertFrom-Json | Format-Table email, timestamp
```

## Description
Reads from `waitlist.json` and prints a formatted table of all email addresses and their sign-up timestamps.
