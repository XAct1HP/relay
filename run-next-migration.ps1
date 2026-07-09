$MigrationDir = ".\supabase\migrations"
$ProgressFile = ".\supabase-cutover-backups\migration-progress.txt"

if (!(Test-Path ".\supabase-cutover-backups")) {
    New-Item -ItemType Directory -Force -Path ".\supabase-cutover-backups" | Out-Null
}

$files = Get-ChildItem "$MigrationDir\*.sql" | Sort-Object LastWriteTime

$completed = @()
if (Test-Path $ProgressFile) {
    $completed = Get-Content $ProgressFile
}

$next = $files | Where-Object { $completed -notcontains $_.Name } | Select-Object -First 1

if ($null -eq $next) {
    Write-Host "All migrations completed." -ForegroundColor Green
    exit 0
}

Write-Host ""
Write-Host "Next migration:" -ForegroundColor Cyan
Write-Host $next.Name
Write-Host "Last written: $($next.LastWriteTime)"
Write-Host ""

$confirm = Read-Host "Run this migration against the currently linked Supabase project? Type YES"

if ($confirm -ne "YES") {
    Write-Host "Cancelled."
    exit 1
}

$tempFile = ".\supabase-cutover-backups\current_migration.sql"

"-- Running file: $($next.Name)" | Set-Content $tempFile
"-- Last written: $($next.LastWriteTime)" | Add-Content $tempFile
"" | Add-Content $tempFile

(Get-Content $next.FullName) `
    -replace 'uuid_generate_v4\(\)', 'gen_random_uuid()' |
Set-Content $tempFile

supabase db query --linked --file $tempFile

if ($LASTEXITCODE -eq 0) {
    Add-Content $ProgressFile $next.Name
    Write-Host ""
    Write-Host "Completed: $($next.Name)" -ForegroundColor Green
    Write-Host "Run .\run-next-migration.ps1 again for the next one."
} else {
    Write-Host ""
    Write-Host "FAILED: $($next.Name)" -ForegroundColor Red
    Write-Host "Fix the SQL file, then rerun this same command."
    exit 1
}