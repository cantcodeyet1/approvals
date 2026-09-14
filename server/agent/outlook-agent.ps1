<#
Approvals Outlook Agent
=======================
Runs on a Windows PC with Outlook installed and signed into your work
account. Polls the Approvals backend for "send via email" jobs queued by
anyone using the app (from any device), downloads the invoice attachments,
and sends the email through this machine's real Outlook — so it goes out
as genuinely you, with normal deliverability, no third-party service
in the middle.

Requirements:
  - This PC must be on, logged in, with Outlook already signed into the
    account you want to send from.
  - PowerShell (built into Windows).

Setup:
  1. Fill in $AgentSecret below with the exact value of EMAIL_AGENT_SECRET
     from the server's environment (Render dashboard -> Environment).
  2. Confirm $BackendUrl matches your deployed backend.
  3. Run this script: right-click -> Run with PowerShell, or from a
     PowerShell window: .\outlook-agent.ps1
  4. Leave the window open — it polls every few seconds. Closing it stops
     the agent (and "Send via email" in the app falls back to demo mode
     until it's running again).

Optional: to have this start automatically when you log in, create a
Windows Scheduled Task that runs "powershell.exe -ExecutionPolicy Bypass
-File <path to this script>" at log-on.

If Outlook shows a security prompt ("A program is trying to send an email
on your behalf") the first time it sends, that's Outlook's own built-in
protection — click Allow. If it keeps prompting every single send and
that's a problem, look into the "Redemption" COM library (a well-known,
inexpensive third-party tool built exactly for this) as a next step.
#>

param(
  [string]$BackendUrl = "https://approvals-hs55.onrender.com",
  [string]$AgentSecret = "PASTE_YOUR_EMAIL_AGENT_SECRET_HERE",
  [int]$PollSeconds = 5
)

if ($AgentSecret -eq "PASTE_YOUR_EMAIL_AGENT_SECRET_HERE") {
  Write-Host "Set `$AgentSecret at the top of this script (or pass -AgentSecret) before running." -ForegroundColor Yellow
  exit 1
}

$headers = @{ "X-Agent-Secret" = $AgentSecret }

function Send-ApprovalsJob {
  param($Job)

  $outlook = New-Object -ComObject Outlook.Application
  $mail = $outlook.CreateItem(0) # olMailItem
  $mail.To = $Job.to
  if ($Job.cc) { $mail.CC = $Job.cc }
  $mail.Subject = $Job.subject

  # Plain-text .Body carries no font at all — the recipient's client just
  # uses its own default. Set .HTMLBody instead, wrapped in the same Tahoma
  # styling the SendGrid path already uses, so both sending paths look the
  # same to the recipient regardless of which one handled a given send.
  $escapedBody = [System.Net.WebUtility]::HtmlEncode($Job.body) -replace "`r?`n", "<br>"
  $mail.HTMLBody = "<div style=`"font-family:Tahoma,Verdana,sans-serif;font-size:14px;color:#1a1a1a;`">$escapedBody</div>"

  $tempFiles = @()
  try {
    foreach ($att in $Job.attachments) {
      $tempPath = Join-Path $env:TEMP ("approvals-" + [guid]::NewGuid().ToString("N").Substring(0, 8) + "-" + $att.filename)
      Invoke-WebRequest -Uri $att.url -OutFile $tempPath -TimeoutSec 60
      $mail.Attachments.Add($tempPath) | Out-Null
      $tempFiles += $tempPath
    }

    $mail.Send()
  } finally {
    foreach ($f in $tempFiles) {
      Remove-Item $f -ErrorAction SilentlyContinue
    }
  }
}

Write-Host "Approvals Outlook agent starting."
Write-Host "Backend: $BackendUrl"
Write-Host "Polling every $PollSeconds seconds. Press Ctrl+C to stop." -ForegroundColor Cyan
Write-Host ""

while ($true) {
  try {
    $response = Invoke-RestMethod -Uri "$BackendUrl/api/email/agent/poll" -Headers $headers -Method Get -TimeoutSec 60

    if ($response.job) {
      $job = $response.job
      $stamp = Get-Date -Format "HH:mm:ss"
      Write-Host "[$stamp] Sending job $($job.id) to $($job.to)..."

      try {
        Send-ApprovalsJob -Job $job
        $body = @{ success = $true } | ConvertTo-Json
        Invoke-RestMethod -Uri "$BackendUrl/api/email/agent/jobs/$($job.id)/complete" -Headers $headers -Method Post -Body $body -ContentType "application/json" | Out-Null
        Write-Host "  Sent." -ForegroundColor Green
      } catch {
        $errMsg = $_.Exception.Message
        Write-Host "  FAILED: $errMsg" -ForegroundColor Red
        $body = @{ success = $false; error = $errMsg } | ConvertTo-Json
        try {
          Invoke-RestMethod -Uri "$BackendUrl/api/email/agent/jobs/$($job.id)/complete" -Headers $headers -Method Post -Body $body -ContentType "application/json" | Out-Null
        } catch {
          Write-Host "  (also failed to report the failure back to the server: $($_.Exception.Message))" -ForegroundColor Red
        }
      }
    }
  } catch {
    $stamp = Get-Date -Format "HH:mm:ss"
    Write-Host "[$stamp] Poll error: $($_.Exception.Message)" -ForegroundColor DarkYellow
  }

  Start-Sleep -Seconds $PollSeconds
}
