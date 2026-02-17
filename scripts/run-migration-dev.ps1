param(
  [int]$BackendPort = 8000,
  [int]$FrontendPort = 3000
)

$ErrorActionPreference = "Stop"

Write-Host "Starting migration stack..." -ForegroundColor Cyan
Write-Host "Backend:  http://localhost:$BackendPort" -ForegroundColor Green
Write-Host "Frontend: http://localhost:$FrontendPort" -ForegroundColor Green

Write-Host "`n[1/2] Backend setup"
Push-Location "$PSScriptRoot\..\backend-fastapi"
if (-not (Test-Path ".venv")) {
  python -m venv .venv
}
. .\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PWD'; .\.venv\Scripts\Activate.ps1; uvicorn app.main:app --reload --port $BackendPort"
Pop-Location

Write-Host "[2/2] Frontend setup"
Push-Location "$PSScriptRoot\..\frontend-next"
npm install
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PWD'; `$env:NEXT_PUBLIC_API_BASE_URL='http://localhost:$BackendPort'; npm run dev -- --port $FrontendPort"
Pop-Location

Write-Host "`nDone. Open http://localhost:$FrontendPort" -ForegroundColor Yellow
