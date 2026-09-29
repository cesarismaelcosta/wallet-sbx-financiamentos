# Roda o teste do orchestrator com k6.
#   .\rodar.ps1            -> smoke (3 requisições)
#   .\rodar.ps1 -Carga     -> carga completa (cuidado com o rate limit)
#   .\rodar.ps1 -Stress    -> degraus 200/300/400/500 VUs (~12 min)
param([switch]$Carga, [switch]$Stress)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

# Recarrega o PATH (k6 recém-instalado)
$env:Path = [Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [Environment]::GetEnvironmentVariable("Path","User")

# Anon key: lida do .env do projeto (chave pública do front)
$linha = Select-String -Path "..\.env" -Pattern '^VITE_SUPABASE_(ANON_KEY|PUBLISHABLE_KEY)\s*=' | Select-Object -First 1
if (-not $linha) { throw "Não achei VITE_SUPABASE_ANON_KEY/PUBLISHABLE_KEY no .env" }
$env:ANON_KEY = ($linha.Line -split '=', 2)[1].Trim().Trim('"').Trim("'")

# Token de sessão: colado por você (DevTools -> Network -> orchestrator -> Headers -> x-session-token)
if (-not $env:SESSION_TOKEN -or -not $env:SESSION_TOKEN.StartsWith("eyJ")) {
  $env:SESSION_TOKEN = (Read-Host "Cole o x-session-token").Trim()
}

if ($Stress)    { k6 run -e STRESS=1 carga-orchestrator.js }
elseif ($Carga) { k6 run carga-orchestrator.js }
else        { k6 run -e SMOKE=1 carga-orchestrator.js }
