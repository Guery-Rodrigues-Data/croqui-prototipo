$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:8743/")
$listener.Start()
$root = "C:\Users\guery.braga\Documents\prototipos\croqui-prototipo"
$backupPath = Join-Path $root "backup-dados.json"

while ($listener.IsListening) {
  $context = $listener.GetContext()
  $request = $context.Request
  $response = $context.Response
  $path = $request.Url.LocalPath

  if ($request.HttpMethod -eq "POST" -and $path -eq "/api/backup") {
    # Grava o snapshot completo dos croquis num arquivo de verdade em disco, além do
    # localStorage do navegador — assim os dados sobrevivem a um cache limpo, troca de
    # navegador, etc. Chamado automaticamente pelo cliente a cada salvamento.
    #
    # $request.ContentEncoding é deduzido do charset do header Content-Type — como o
    # cliente manda só "application/json" (sem ";charset=utf-8"), o .NET caía pro
    # codepage ANSI do Windows pra decodificar o corpo, embora o fetch() do navegador
    # sempre mande UTF-8 de verdade. Resultado: todo acento (ç, ã, â...) virava mojibake
    # ao salvar (ex. "Ângelo" virava "Ã‚ngelo"). Forçando UTF-8 aqui, sem depender do
    # header, corrige a leitura na origem.
    $reader = New-Object System.IO.StreamReader($request.InputStream, [System.Text.Encoding]::UTF8)
    $body = $reader.ReadToEnd()
    $reader.Close()
    $utf8SemBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($backupPath, $body, $utf8SemBom)
    $response.StatusCode = 200
  } else {
    if ($path -eq "/") { $path = "/index.html" }
    $filePath = Join-Path $root $path.TrimStart("/")
    if (Test-Path $filePath -PathType Leaf) {
      $bytes = [System.IO.File]::ReadAllBytes($filePath)
      $ext = [System.IO.Path]::GetExtension($filePath)
      $ct = switch ($ext) {
        ".html" { "text/html" }
        ".css"  { "text/css" }
        ".js"   { "application/javascript" }
        ".json" { "application/json" }
        default { "application/octet-stream" }
      }
      $response.ContentType = $ct
      $response.ContentLength64 = $bytes.Length
      $response.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $response.StatusCode = 404
    }
  }
  $response.OutputStream.Close()
}
