# make-icon.ps1 — generate the extension icon (256x256 PNG) deterministically, no assets.
# Motif: the Forge's node-graph canvas — four cyan nodes wired into an X with an amber
# forge-spark hub, on the app's dark #0d1117, inside a teal rounded frame.
Add-Type -AssemblyName System.Drawing

$size = 256
$bmp = New-Object System.Drawing.Bitmap($size, $size)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias

# Transparent corners + rounded dark plate
$g.Clear([System.Drawing.Color]::Transparent)
$plate = New-Object System.Drawing.Drawing2D.GraphicsPath
$r = 44; $m = 6; $w = $size - 2*$m
$plate.AddArc($m, $m, $r, $r, 180, 90)
$plate.AddArc($m + $w - $r, $m, $r, $r, 270, 90)
$plate.AddArc($m + $w - $r, $m + $w - $r, $r, $r, 0, 90)
$plate.AddArc($m, $m + $w - $r, $r, $r, 90, 90)
$plate.CloseFigure()

$bgBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
  (New-Object System.Drawing.Point(0,0)), (New-Object System.Drawing.Point(0,$size)),
  [System.Drawing.Color]::FromArgb(255, 16, 22, 33), [System.Drawing.Color]::FromArgb(255, 9, 12, 18))
$g.FillPath($bgBrush, $plate)
$framePen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(200, 34, 211, 238), 5)
$g.DrawPath($framePen, $plate)

# Faint grid (canvas feel)
$gridPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(18, 148, 210, 230), 1)
$g.SetClip($plate)
for ($x = 32; $x -lt $size; $x += 32) { $g.DrawLine($gridPen, $x, 0, $x, $size) }
for ($y = 32; $y -lt $size; $y += 32) { $g.DrawLine($gridPen, 0, $y, $size, $y) }

# Node positions: X of four corners + hub
$corners = @(@(76,76), @(180,76), @(76,180), @(180,180))
$hub = @(128,128)

# Wires (drawn under nodes) — slight glow via two passes
$wireGlow = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(70, 34, 211, 238), 9)
$wire = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 56, 189, 248), 3.5)
foreach ($c in $corners) {
  $g.DrawLine($wireGlow, $c[0], $c[1], $hub[0], $hub[1])
  $g.DrawLine($wire, $c[0], $c[1], $hub[0], $hub[1])
}

function Draw-Node($g, $x, $y, $radius, $core, $glow) {
  $glowBrush = New-Object System.Drawing.SolidBrush($glow)
  $g.FillEllipse($glowBrush, $x - $radius*1.9, $y - $radius*1.9, $radius*3.8, $radius*3.8)
  $coreBrush = New-Object System.Drawing.SolidBrush($core)
  $g.FillEllipse($coreBrush, $x - $radius, $y - $radius, $radius*2, $radius*2)
  $rim = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(230, 240, 253, 255), 2)
  $g.DrawEllipse($rim, $x - $radius, $y - $radius, $radius*2, $radius*2)
}

$cyanCore = [System.Drawing.Color]::FromArgb(255, 34, 211, 238)
$cyanGlow = [System.Drawing.Color]::FromArgb(48, 34, 211, 238)
foreach ($c in $corners) { Draw-Node $g $c[0] $c[1] 15 $cyanCore $cyanGlow }

# Amber forge-spark hub (bigger, hot)
$amberCore = [System.Drawing.Color]::FromArgb(255, 251, 191, 36)
$amberGlow = [System.Drawing.Color]::FromArgb(70, 251, 146, 60)
Draw-Node $g $hub[0] $hub[1] 21 $amberCore $amberGlow

$g.ResetClip()
$g.Dispose()
$out = Join-Path $PSScriptRoot '..\icon.png'
$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
Write-Host "[make-icon] wrote $out ($((Get-Item $out).Length) bytes)"
