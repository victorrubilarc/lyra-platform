# =============================================================================
#  Lyra WatchLog - doctor (Windows): diagnostico PASA/FALLA del host de la planta.
#  Envoltorio delgado de `install.ps1 -Check` (unica fuente de verdad de los
#  chequeos). No modifica nada; sale 0 si todo pasa, 1 si hay alguna FALLA.
#
#    .\doctor.ps1
# =============================================================================
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
& (Join-Path $here 'install.ps1') -Check
exit $LASTEXITCODE
