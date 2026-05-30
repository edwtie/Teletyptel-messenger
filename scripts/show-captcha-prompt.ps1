param(
    [Parameter(Mandatory = $true)]
    [string]$ImageUrl,

    [Parameter(Mandatory = $true)]
    [string]$OutputPath,

    [string]$Title = "Teletyptel CAPTCHA"
)

$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

[System.Windows.Forms.Application]::EnableVisualStyles()

$outputDirectory = Split-Path -Parent $OutputPath
if (-not [string]::IsNullOrWhiteSpace($outputDirectory)) {
    New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null
}

$webClient = [System.Net.WebClient]::new()
$imageBytes = $webClient.DownloadData($ImageUrl)
$stream = [System.IO.MemoryStream]::new($imageBytes)
$image = [System.Drawing.Image]::FromStream($stream)

$form = [System.Windows.Forms.Form]::new()
$form.Text = $Title
$form.StartPosition = "CenterScreen"
$form.TopMost = $true
$form.MinimizeBox = $false
$form.MaximizeBox = $false
$form.FormBorderStyle = "FixedDialog"
$form.ClientSize = [System.Drawing.Size]::new(520, 250)

$label = [System.Windows.Forms.Label]::new()
$label.Text = "Typ de tekst uit de CAPTCHA-afbeelding."
$label.AutoSize = $true
$label.Location = [System.Drawing.Point]::new(16, 14)
$form.Controls.Add($label)

$picture = [System.Windows.Forms.PictureBox]::new()
$picture.Image = $image
$picture.SizeMode = "Zoom"
$picture.BorderStyle = "FixedSingle"
$picture.Location = [System.Drawing.Point]::new(16, 42)
$picture.Size = [System.Drawing.Size]::new(488, 95)
$form.Controls.Add($picture)

$textBox = [System.Windows.Forms.TextBox]::new()
$textBox.Location = [System.Drawing.Point]::new(16, 152)
$textBox.Size = [System.Drawing.Size]::new(488, 26)
$textBox.Font = [System.Drawing.Font]::new("Segoe UI", 11)
$form.Controls.Add($textBox)

$okButton = [System.Windows.Forms.Button]::new()
$okButton.Text = "OK"
$okButton.Location = [System.Drawing.Point]::new(332, 196)
$okButton.Size = [System.Drawing.Size]::new(82, 30)
$okButton.DialogResult = [System.Windows.Forms.DialogResult]::OK
$form.AcceptButton = $okButton
$form.Controls.Add($okButton)

$cancelButton = [System.Windows.Forms.Button]::new()
$cancelButton.Text = "Annuleren"
$cancelButton.Location = [System.Drawing.Point]::new(422, 196)
$cancelButton.Size = [System.Drawing.Size]::new(82, 30)
$cancelButton.DialogResult = [System.Windows.Forms.DialogResult]::Cancel
$form.CancelButton = $cancelButton
$form.Controls.Add($cancelButton)

$form.Add_Shown({
    $form.Activate()
    $textBox.Focus()
})

$result = $form.ShowDialog()
if ($result -ne [System.Windows.Forms.DialogResult]::OK) {
    exit 2
}

$answer = $textBox.Text.Trim()
if ([string]::IsNullOrWhiteSpace($answer)) {
    exit 3
}

Set-Content -LiteralPath $OutputPath -Value $answer -Encoding UTF8
