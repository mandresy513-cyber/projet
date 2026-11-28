<?php
/**
 * BOXIBY — Réception des positions des boîtiers GPS de moto.
 * POST : device=<GPS de la moto>&key=<GPS_DEVICE_KEY>&lat=..&lng=..
 */
declare(strict_types=1);
require __DIR__ . '/../config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_out(['error' => 'POST requis'], 405);
$d = input();
if (!hash_equals(GPS_DEVICE_KEY, (string)($d['key'] ?? ''))) json_out(['error' => 'Clé invalide'], 401);
$lat = (float)($d['lat'] ?? 0); $lng = (float)($d['lng'] ?? 0);
if ($lat < -90 || $lat > 90 || $lng < -180 || $lng > 180) json_out(['error' => 'Coordonnées invalides'], 422);

$st = db()->prepare("SELECT id FROM livreurs WHERE gps_moto = ?");
$st->execute([trim((string)($d['device'] ?? ''))]);
$id = $st->fetchColumn();
if (!$id) json_out(['error' => 'Boîtier inconnu'], 404);
db()->prepare("INSERT INTO positions_livreurs (livreur_id, latitude, longitude, source) VALUES (?,?,?, 'moto')")->execute([$id, $lat, $lng]);
json_out(['ok' => true]);
