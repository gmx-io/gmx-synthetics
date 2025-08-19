# Test gas regression check logic in PowerShell

# Generate current gas report
forge test --match-contract SwapHandlerTests --gas-report > current_gas_report.txt

# Extract swap function gas usage
$gasReport = Get-Content current_gas_report.txt
$swapLine = $gasReport | Select-String -Pattern "swap" | Select-Object -First 1
if ($swapLine) {
    $swapGas = $swapLine -split "\s+" | Where-Object {$_ -match "^\d+$"} | Select-Object -First 1
}

# Check if baseline snapshot exists
if (Test-Path ".gas-snapshot") {
    # If baseline exists, extract swap-related test gas usage
    $baselineContent = Get-Content ".gas-snapshot"
    $baselineLine = $baselineContent | Select-String -Pattern "test_constantProductApproximation|test_nonNegativeReserves|test_quoteValueConservation" | Select-Object -First 1
    if ($baselineLine) {
        $baselineGas = $baselineLine -split "\s+" | Where-Object {$_ -match "^\d+$"} | Select-Object -Last 1
    }
} else {
    Write-Output "Error: .gas-snapshot file not found"
    exit 1
}

if (-not $swapGas -or -not $baselineGas) {
    Write-Output "Error: Could not find swap() gas data"
    exit 1
}

# Convert to integers
$swapGasInt = [int]$swapGas
$baselineGasInt = [int]$baselineGas

# Calculate 5% threshold
$threshold = [int][Math]::Ceiling($baselineGasInt * 1.05)

# Print debug information
Write-Output "Current gas report:
$gasReport"
Write-Output "Baseline snapshot:
$baselineContent"

Write-Output "Current swap() gas: $swapGasInt"
Write-Output "Baseline swap() gas: $baselineGasInt"
Write-Output "Threshold (5% increase): $threshold"

if ($swapGasInt -gt $threshold) {
    Write-Output "ERROR: swap() gas usage exceeds baseline by more than 5%"
    exit 1
} else {
    Write-Output "OK: swap() gas usage is within acceptable range"
}