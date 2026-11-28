<?php
declare(strict_types=1);
require __DIR__ . '/../config.php';
$me = livreur_me();
if (!$me) { header('Location: login.php'); exit; }
$ini = htmlspecialchars(mb_strtoupper(mb_substr($me['prenom'], 0, 1) . mb_substr($me['nom'], 0, 1)));
?>
<!DOCTYPE html>
<html lang="fr" data-theme="light">
<head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="csrf" content="<?= csrf_token() ?>"><meta name="robots" content="noindex">
<meta name="theme-color" content="#0E4169">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="BOXIBY">
<link rel="manifest" href="../manifest.json">
<link rel="icon" href="../assets/img/favicon.ico">
<link rel="apple-touch-icon" href="../assets/img/apple-touch-icon.png">
<link rel="apple-touch-startup-image" media="(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3)" href="../assets/img/startup-iphone.png">
<link rel="apple-touch-startup-image" media="(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3)" href="../assets/img/startup-iphone-2.png">
  <title>BOXIBY — Espace livreur</title>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
  <link rel="stylesheet" href="../assets/css/style.css">
  <script>try{if(localStorage.getItem('bx-theme')==='dark')document.documentElement.dataset.theme='dark'}catch(e){}</script>
</head>
<body>
<header class="topbar">
  <div class="logo-plate">
  <img
    id="site-logo"
    src="../assets/img/logo.png"
    data-logo-light="../assets/img/logo.png"
    data-logo-dark="../assets/img/logo-noir.png"
    alt="BOXIBY Madagascar"
  >
</div>
  <div class="topbar-title"><?= htmlspecialchars($me['prenom'] . ' ' . $me['nom']) ?> · <?= htmlspecialchars($me['code_boxiby']) ?></div>
  <div class="topbar-actions">
    <button id="btn-theme" class="icon-btn" type="button" aria-label="Mode sombre">
      <svg class="i-moon" viewBox="0 0 24 24"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>
      <svg class="i-sun" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/></svg>
    </button>
    <div class="avatar me"><?= $me['photo_profil'] ? '<img src="../' . htmlspecialchars($me['photo_profil']) . '" alt="">' : "<span>$ini</span>" ?></div>
    <a class="btn ghost small light" href="../logout.php?to=livreur">Quitter</a>
  </div>
</header>

<main>
  <section class="map-section"><div id="map" class="liv-map"></div>
    <div class="map-stats"><span id="gps-state">Localisation…</span></div></section>

  <section class="panel">
    <div class="card row wrap-m" id="box-statut">
      <div class="grow"><div class="name">Mon statut : <span id="statut-pill" class="badge">…</span></div><div class="sub" id="statut-sub"></div></div>
      <div class="btns"><button id="btn-pause" class="btn ghost small" type="button">Passer en pause (1 h)</button>
        <button id="btn-dispo" class="btn primary small" type="button" hidden>Je suis disponible</button></div>
    </div>
    <p id="banner-gps" class="alert" hidden></p>
    <div id="box-pending"></div>
    <h3>Mes missions</h3>
    <div id="box-missions"></div>
    <h3>Historique de mes courses</h3>
    <div id="box-histo"></div>
  </section>
</main>

<dialog id="dlg-end" class="dlg">
  <button class="dlg-x" data-close aria-label="Fermer">×</button>
  <form id="form-end"><h2>Confirmer la livraison</h2><p id="end-ref" class="muted"></p>
    <label id="lbl-photo">Photo du colis livré (obligatoire)<input type="file" name="photo" id="end-photo" accept="image/*" capture="environment"></label>
    <div id="wrap-sig"><label>Signature du destinataire (obligatoire)</label><canvas id="sig" width="440" height="180"></canvas>
      <button type="button" class="btn ghost small" id="sig-clear">Effacer</button></div>
    <p id="end-err" class="alert" hidden></p>
    <div class="dlg-actions"><button type="button" class="btn ghost" data-close>Annuler</button><button class="btn primary" type="submit">Confirmer</button></div>
  </form>
</dialog>

<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>window.BASE = '../';</script>
<script src="../assets/js/common.js"></script>
<script src="../assets/js/livreur.js"></script>
</body>
</html>
