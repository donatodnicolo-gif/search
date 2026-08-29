'use strict';
// Enumerazione dei dispositivi attaccati su Windows.
//  - Dischi/chiavette/SD: via PowerShell (Get-Disk/Get-Partition/Get-Volume). Danno
//    il percorso grezzo \\.\PhysicalDriveN e la dimensione (che serve al reader).
//  - Telefoni (MTP/WPD): via Shell.Application. Attenzione: MTP NON e' un disco a
//    blocchi, quindi niente recupero profondo dei cancellati; si copiano solo i file
//    ancora presenti che il telefono espone.

const { spawnSync, spawn } = require('child_process');

function runPowerShell(script) {
  const res = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, windowsHide: true,
  });
  if (res.error) throw res.error;
  return res.stdout || '';
}

function parseJson(out, fallback) {
  const t = (out || '').trim();
  if (!t) return fallback;
  try { const v = JSON.parse(t); return Array.isArray(v) ? v : [v]; } catch (_) { return fallback; }
}

const DISK_SCRIPT = `
$ErrorActionPreference='SilentlyContinue'
$out = Get-Disk | ForEach-Object {
  $d = $_
  $vols = @(Get-Partition -DiskNumber $d.Number | ForEach-Object {
    $p = $_; $v = Get-Volume -Partition $p 2>$null
    [pscustomobject]@{
      letter = [string]$p.DriveLetter
      size   = [int64]$p.Size
      offset = [int64]$p.Offset
      fs     = [string]$v.FileSystem
      label  = [string]$v.FileSystemLabel
    }
  })
  [pscustomobject]@{
    number = [int]$d.Number
    model  = [string]$d.FriendlyName
    size   = [int64]$d.Size
    bus    = [string]$d.BusType
    media  = [string]$d.MediaType
    serial = ([string]$d.SerialNumber).Trim()
    logical = [int]$d.LogicalSectorSize
    physical = [int]$d.PhysicalSectorSize
    partitionStyle = [string]$d.PartitionStyle
    volumes = $vols
  }
}
@($out) | ConvertTo-Json -Depth 6
`;

const PHONE_SCRIPT = `
$ErrorActionPreference='SilentlyContinue'
$shell = New-Object -ComObject Shell.Application
$pc = $shell.NameSpace(17)
$out = @()
if ($pc) {
  foreach ($it in $pc.Items()) {
    $path = [string]$it.Path
    # i dischi normali hanno path tipo "C:\\"; i dispositivi MTP/WPD hanno path "::{GUID}..."
    if ($path -notmatch '^[A-Za-z]:\\\\?$') {
      $out += [pscustomobject]@{ name = [string]$it.Name; type = [string]$it.Type; path = $path }
    }
  }
}
@($out) | ConvertTo-Json -Depth 3
`;

async function listDisks() {
  let raw;
  try { raw = runPowerShell(DISK_SCRIPT); } catch (_) { return []; }
  const disks = parseJson(raw, []);
  return disks.filter((d) => d && typeof d.number === 'number').map((d) => {
    const bus = d.bus || '';
    const removable = /USB|SD|MMC/i.test(bus) || /Removable/i.test(d.media || '');
    const volumes = (d.volumes || []).filter(Boolean).map((v) => ({
      letter: v.letter || null,
      devicePath: v.letter ? `\\\\.\\${v.letter}:` : null,
      size: v.size || 0,
      offset: v.offset || 0,
      fs: v.fs || '',
      label: v.label || '',
    }));
    return {
      kind: 'disk',
      index: d.number,
      devicePath: `\\\\.\\PhysicalDrive${d.number}`,
      model: (d.model || 'Disco').trim(),
      size: d.size || 0,
      bus,
      media: d.media || '',
      removable,
      serial: d.serial || '',
      sectorSize: d.logical || 512,
      partitionStyle: d.partitionStyle || '',
      volumes,
    };
  });
}

async function listPhones() {
  let raw;
  try { raw = runPowerShell(PHONE_SCRIPT); } catch (_) { return []; }
  const items = parseJson(raw, []);
  return items.filter(Boolean).map((it) => ({
    kind: 'phone',
    name: it.name || 'Dispositivo',
    type: it.type || 'MTP',
    shellPath: it.path || '',
    note: 'MTP: solo i file presenti che il telefono espone. Nessun recupero profondo dei cancellati senza root/jailbreak.',
  }));
}

// Copia best-effort dei file da un telefono MTP nella cartella `dest` (sperimentale).
// Cammina lo spazio-nomi della shell e usa CopyHere. Puo' essere lento e non riportare
// ogni errore. NON e' recupero di file cancellati: copia solo cio' che c'e'.
function copyPhoneFilesScript(deviceName, dest) {
  return `
$ErrorActionPreference='SilentlyContinue'
$destPath='${dest.replace(/\\/g, '\\\\').replace(/'/g, "''")}'
New-Item -ItemType Directory -Force -Path $destPath | Out-Null
$shell = New-Object -ComObject Shell.Application
$pc = $shell.NameSpace(17)
$dev = $null
foreach ($it in $pc.Items()) { if ($it.Name -eq '${deviceName.replace(/'/g, "''")}') { $dev = $it } }
if (-not $dev) { Write-Output 'DEVICE_NOT_FOUND'; return }
$destFolder = $shell.NameSpace($destPath)
$count = 0
function Walk($folder) {
  foreach ($item in $folder.Items()) {
    if ($item.IsFolder) { Walk($item.GetFolder) }
    else { $script:count++; $destFolder.CopyHere($item, 16) }
  }
}
Walk($dev.GetFolder)
Write-Output ("COPIED=" + $count)
`;
}

async function copyPhoneFiles(deviceName, dest) {
  try {
    const out = runPowerShell(copyPhoneFilesScript(deviceName, dest));
    const m = /COPIED=(\d+)/.exec(out);
    if (/DEVICE_NOT_FOUND/.test(out)) return { ok: false, error: 'Dispositivo non trovato' };
    return { ok: true, copied: m ? Number(m[1]) : 0 };
  } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
}

// Cerca file per nome dentro un telefono MTP camminando lo spazio-nomi della shell.
// Trova solo cio' che il telefono espone (inclusi i cestini nascosti .trashed se
// visibili); NON e' recupero profondo. Con copyDest copia i trovati sul PC.
// opts: { copyDest?, onMatch({path,name,size}), onProgress({files}), signal }
function phoneSearch(deviceName, patterns, opts = {}) {
  const clean = (s) => String(s).replace(/'/g, "''").replace(/[|\r\n]/g, '');
  const pats = patterns.map((p) => clean(p).toLowerCase()).filter((p) => p.length >= 3);
  if (!pats.length) return Promise.resolve({ ok: false, error: 'Pattern troppo corto (minimo 3 caratteri).' });
  const patList = pats.map((p) => `'${p}'`).join(',');
  const copyDest = opts.copyDest ? clean(opts.copyDest) : '';

  const script = `
$ErrorActionPreference='SilentlyContinue'
$patterns = @(${patList})
$copyDest = '${copyDest}'
$shell = New-Object -ComObject Shell.Application
$pc = $shell.NameSpace(17)
$dev = $null
if ($pc) { foreach ($it in $pc.Items()) { if ($it.Name -eq '${clean(deviceName)}') { $dev = $it } } }
if (-not $dev) { Write-Output 'ERR|DEVICE_NOT_FOUND'; exit }
$destNs = $null
if ($copyDest) { New-Item -ItemType Directory -Force -Path $copyDest | Out-Null; $destNs = $shell.NameSpace($copyDest) }
$script:count = 0
$script:copied = 0
function Walk($folder, $rel) {
  if (-not $folder) { return }
  foreach ($item in $folder.Items()) {
    if ($item.IsFolder) {
      Walk $item.GetFolder ($rel + '/' + $item.Name)
    } else {
      $script:count++
      if ($script:count % 200 -eq 0) { Write-Output ("PROG|" + $script:count) }
      $n = ([string]$item.Name).ToLower()
      foreach ($p in $patterns) {
        if ($n -like ('*' + $p + '*')) {
          Write-Output ("MATCH|" + $rel + '/' + $item.Name + '|' + [string]$item.Size)
          if ($destNs) { $destNs.CopyHere($item, 16); $script:copied++ }
          break
        }
      }
    }
  }
}
Walk $dev.GetFolder ''
if ($destNs -and $script:copied -gt 0) {
  # CopyHere e' asincrono: aspetto che i file arrivino davvero (max ~60s)
  for ($i = 0; $i -lt 60; $i++) {
    $have = @(Get-ChildItem -LiteralPath $copyDest -File -ErrorAction SilentlyContinue).Count
    if ($have -ge $script:copied) { break }
    Start-Sleep -Seconds 1
  }
}
Write-Output ("DONE|" + $script:count + "|" + $script:copied)
`;

  return new Promise((resolve) => {
    let child;
    try {
      child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true });
    } catch (e) { return resolve({ ok: false, error: String(e && e.message || e) }); }
    if (opts.signal) opts.signal.addEventListener('abort', () => { try { child.kill(); } catch (_) {} });

    // watchdog: se il telefono si blocca (schermo spento) la sessione MTP si congela
    // e la camminata resta appesa per sempre — meglio accorgersene e dirlo chiaro
    const stallMs = opts.stallMs || 120000;
    let stalled = false;
    let watchdog = setTimeout(onStall, stallMs);
    function onStall() { stalled = true; try { child.kill(); } catch (_) {} }
    function fed() { clearTimeout(watchdog); watchdog = setTimeout(onStall, stallMs); }

    const matches = [];
    let files = 0; let copied = 0; let buf = '';
    const handleLine = (line) => {
      fed();
      const parts = line.split('|');
      if (parts[0] === 'MATCH') {
        const m = { path: parts[1] || '', name: (parts[1] || '').split('/').pop(), size: Number(parts[2]) || 0 };
        matches.push(m);
        if (opts.onMatch) opts.onMatch(m);
      } else if (parts[0] === 'PROG') {
        files = Number(parts[1]) || files;
        if (opts.onProgress) opts.onProgress({ files });
      } else if (parts[0] === 'DONE') {
        files = Number(parts[1]) || files; copied = Number(parts[2]) || 0;
      } else if (parts[0] === 'ERR') {
        matches.error = parts[1];
      }
    };
    child.stdout.on('data', (b) => {
      buf += b;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (line) handleLine(line); }
    });
    child.on('error', (e) => { clearTimeout(watchdog); resolve({ ok: false, error: String(e && e.message || e) }); });
    child.on('close', () => {
      clearTimeout(watchdog);
      if (buf.trim()) handleLine(buf.trim());
      if (matches.error === 'DEVICE_NOT_FOUND') return resolve({ ok: false, error: 'Telefono non trovato: e\' sbloccato e in modalita\' "Trasferimento file"?' });
      if (stalled) return resolve({ ok: false, error: `Il telefono ha smesso di rispondere dopo ${files.toLocaleString('it')} file (schermo bloccato?). Sbloccalo, tienilo acceso durante la ricerca e riprova.`, matches, files });
      resolve({ ok: true, matches, files, copied });
    });
  });
}

async function listAll() {
  const [disks, phones] = await Promise.all([listDisks(), listPhones()]);
  return { disks, phones };
}

module.exports = { listDisks, listPhones, listAll, copyPhoneFiles, phoneSearch, runPowerShell };
