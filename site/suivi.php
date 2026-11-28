<?php
declare(strict_types=1);
require __DIR__ . '/config.php';
$t = preg_replace('/[^a-f0-9]/', '', (string)($_GET['t'] ?? ''));
// Récupérer le numéro de l'admin BOXIBY depuis la base de données
$admin_tel = '0340000000'; // ← REMPLACEZ par votre vrai numéro ou définissez dans config.php
try {
    $pdo = db();
    $st = $pdo->query("SELECT telephone FROM utilisateurs WHERE role='admin' AND actif=1 LIMIT 1");
    $tel = $st->fetchColumn();
    if ($tel) $admin_tel = $tel;
} catch (Exception $e) {
    // Utiliser le numéro par défaut
}
?>
<!DOCTYPE html>
<html lang="fr" data-theme="light">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<meta name="theme-color" content="#0E4169">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="BOXIBY">
<link rel="manifest" href="manifest.json">
<link rel="icon" href="assets/img/favicon.ico">
<link rel="apple-touch-icon" href="assets/img/apple-touch-icon.png">
<link rel="apple-touch-startup-image" media="(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3)" href="assets/img/startup-iphone.png">
<link rel="apple-touch-startup-image" media="(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3)" href="assets/img/startup-iphone-2.png">
<title>Suivi de ma commande — BOXIBY</title>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<link rel="stylesheet" href="assets/css/style.css">
<script>try{if(localStorage.getItem('bx-theme')==='dark')document.documentElement.dataset.theme='dark'}catch(e){}</script>
</head>
<body>
<header class="topbar">
<a class="logo-plate" href="index.php"><img src="assets/img/logo.png" alt="BOXIBY Madagascar"></a>
<h1 class="topbar-title">Suivi de ma commande</h1>
<div class="topbar-actions">
<button id="btn-theme" class="icon-btn" type="button" aria-label="Mode sombre">
<svg class="i-moon" viewBox="0 0 24 24"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>
<svg class="i-sun" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/></svg>
</button>
<button type="button" class="btn-retour-topbar" onclick="window.location.href='index.php'" title="Retour à l'accueil">
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
<span>Accueil</span>
</button>
</div>
</header>
<main class="container">
<section class="card" id="box-status"><p class="muted">Chargement…</p></section>
<section class="card" id="box-action" hidden></section>
<section class="card" id="box-compte" hidden></section>
<section class="card map-card">
<div class="row" style="margin-bottom:10px">
<h2 class="grow" style="margin:0">Carte</h2>
<label class="check inline"><input type="checkbox" id="share"> Partager ma position en temps réel</label>
<button id="btn-fit" class="btn ghost small" type="button">Recentrer</button>
</div>
<div id="map" class="suivi-map"></div>
<p id="geo-msg" class="muted small-t"></p>
</section>
<section class="card" id="box-livreur" hidden></section>
<section class="card" id="box-rate" hidden></section>
<section class="card" id="box-detail"></section>
<section class="card" id="box-contact">
<h3>Contacter</h3>
<div class="contact-btns">
<button type="button" class="btn-contact btn-call-livreur" id="btn-call-livreur">
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
<span>Appeler le livreur</span>
</button>
<button type="button" class="btn-contact btn-call-admin" id="btn-call-admin" data-tel="<?= htmlspecialchars($admin_tel) ?>">
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
<span>Appeler BOXIBY</span>
</button>
<button type="button" class="btn-contact btn-retour" onclick="window.location.href='index.php'">
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
<span>Retour à l'accueil</span>
</button>
</div>
</section>
</main>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>window.BX = { token: <?= json_encode($t) ?> };</script>
<script src="assets/js/common.js"></script>
<script src="assets/js/suivi.js"></script>
</body>
</html>