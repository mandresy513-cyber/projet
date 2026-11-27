<?php
/**
 * BOXIBY MADAGASCAR — Configuration et fonctions communes.
 * Modifiez DB_* et, surtout, la grille tarifaire ci-dessous.
 */
declare(strict_types=1);

const DB_HOST = 'localhost';
const DB_NAME = 'boxiby';
const DB_USER = 'root';
const DB_PASS = '';

/** Clé secrète des boîtiers GPS de moto (api/gps.php). CHANGEZ-LA. */
const GPS_DEVICE_KEY = 'changez-cette-cle-gps';

/* ===== GRILLE TARIFAIRE (Ar) — VALEURS D'EXEMPLE : remplacez par votre grille validée ===== */
const EXPRESS_FORFAIT  = 6000;   // Express : forfait jusqu'à 6 km
const EXPRESS_KM_SUPP  = 1000;   // Express : par km au-delà de 6 km (jusqu'à 20 km)
const PLANIFIEE_GRILLE = [[6, 5000], [12, 8000], [20, 12000]]; // Planifiée : [km max, montant fixe]
const TARIF_KM_LONG    = 1900;   // Au-delà de 20 km : 1 900 Ar/km, sans limite
const ACCEPT_DELAI_SEC = 180;    // Le livreur a 3 minutes pour accepter
const PAUSE_SEC        = 3600;   // Pause planifiée : 1 heure
const POSITION_LIVE_SEC = 90;    // Au-delà : la position n'est plus « en direct » (dernière position connue)

const UPLOAD_DIR = __DIR__ . '/uploads/';
const UPLOAD_URL = 'uploads/';

date_default_timezone_set('Indian/Antananarivo');

if (session_status() === PHP_SESSION_NONE) {
    session_set_cookie_params(['lifetime' => 0, 'path' => '/', 'httponly' => true, 'samesite' => 'Lax']);
    session_start();
}

function db(): PDO
{
    static $pdo = null;
    if ($pdo === null) {
        $pdo = new PDO('mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4', DB_USER, DB_PASS, [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ]);
        $pdo->exec("SET time_zone = '+03:00'"); // Madagascar
    }
    return $pdo;
}

function json_out($data, int $code = 200): never
{
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PARTIAL_OUTPUT_ON_ERROR);
    exit;
}

/** Corps de requête : JSON ou formulaire (multipart / urlencoded). */
function input(): array
{
    static $d = null;
    if ($d === null) {
        $j = json_decode((string)file_get_contents('php://input'), true);
        $d = is_array($j) ? $j : $_POST;
    }
    return $d;
}

function csrf_token(): string
{
    return $_SESSION['csrf'] ??= bin2hex(random_bytes(32));
}

function check_csrf(): void
{
    if (!hash_equals(csrf_token(), $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '')) {
        json_out(['error' => 'Session expirée, rechargez la page.'], 419);
    }
}

/* ---------- Sessions ---------- */
function admin_me(): ?array
{
    if (empty($_SESSION['admin_id'])) return null;
    $st = db()->prepare("SELECT id, nom, prenom, telephone, photo_profil, theme FROM utilisateurs WHERE id=? AND role='admin' AND actif=1");
    $st->execute([$_SESSION['admin_id']]);
    return $st->fetch() ?: null;
}

function client_me(): ?array
{
    if (empty($_SESSION['client_id'])) return null;
    $st = db()->prepare("SELECT id, nom, prenom, telephone, email, photo_profil FROM utilisateurs WHERE id=? AND role='client' AND actif=1");
    $st->execute([$_SESSION['client_id']]);
    return $st->fetch() ?: null;
}

function livreur_me(): ?array
{
    if (empty($_SESSION['livreur_id'])) return null;
    $st = db()->prepare("SELECT l.id, l.code_im, l.code_boxiby, l.gps_moto, l.tracer_telephone, l.pause_jusqua,
                                u.id AS uid, u.nom, u.prenom, u.telephone, u.photo_profil
                         FROM livreurs l JOIN utilisateurs u ON u.id=l.utilisateur_id
                         WHERE l.id=? AND u.actif=1");
    $st->execute([$_SESSION['livreur_id']]);
    return $st->fetch() ?: null;
}

/* ---------- Utilitaires ---------- */
function norm_tel(string $t): string
{
    $t = preg_replace('/\D/', '', $t);
    if (str_starts_with($t, '261')) $t = '0' . substr($t, 3);
    return $t;
}
function tel_ok(string $t): bool { return (bool)preg_match('/^0\d{9}$/', $t); }

function save_upload(array $file, bool $pdf = false): ?string
{
    if (($file['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) return null;
    if ($file['error'] !== UPLOAD_ERR_OK || $file['size'] > 5 * 1024 * 1024) {
        throw new RuntimeException('Fichier invalide (5 Mo maximum).');
    }
    $mime = (new finfo(FILEINFO_MIME_TYPE))->file($file['tmp_name']);
    $map  = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'] + ($pdf ? ['application/pdf' => 'pdf'] : []);
    if (!isset($map[$mime])) throw new RuntimeException('Format accepté : JPG, PNG, WEBP' . ($pdf ? ' ou PDF.' : '.'));
    $name = bin2hex(random_bytes(12)) . '.' . $map[$mime];
    if (!move_uploaded_file($file['tmp_name'], UPLOAD_DIR . $name)) throw new RuntimeException("Enregistrement impossible.");
    return UPLOAD_URL . $name;
}

function save_data_url(string $dataUrl): string
{
    if (!preg_match('#^data:image/png;base64,([A-Za-z0-9+/=]+)$#', $dataUrl, $m)) throw new RuntimeException('Signature invalide.');
    $bin = base64_decode($m[1], true);
    if ($bin === false || strlen($bin) > 600000 || !@getimagesizefromstring($bin)) throw new RuntimeException('Signature invalide.');
    $name = 'sig_' . bin2hex(random_bytes(10)) . '.png';
    file_put_contents(UPLOAD_DIR . $name, $bin);
    return UPLOAD_URL . $name;
}

/** Distance routière en km (OSRM), repli : à vol d'oiseau x 1,35. */
function route_km(float $lat1, float $lng1, float $lat2, float $lng2): float
{
    $ctx = stream_context_create(['http' => ['timeout' => 4]]);
    $r = @file_get_contents("https://router.project-osrm.org/route/v1/driving/$lng1,$lat1;$lng2,$lat2?overview=false", false, $ctx);
    $j = $r ? json_decode($r, true) : null;
    if (!empty($j['routes'][0]['distance'])) return $j['routes'][0]['distance'] / 1000;
    $R = 6371; $p = M_PI / 180;
    $a = sin(($lat2 - $lat1) * $p / 2) ** 2 + cos($lat1 * $p) * cos($lat2 * $p) * sin(($lng2 - $lng1) * $p / 2) ** 2;
    return 2 * $R * asin(sqrt($a)) * 1.35;
}

/** @return array{0:int,1:int} [km facturés, prix en Ar] */
function calc_prix(string $service, ?string $mode, float $km): array
{
    $k = max(1, (int)floor($km + 0.5));          // 6,5 km -> 7 km
    if ($k > 20) return [$k, $k * TARIF_KM_LONG];
    if ($service === 'colis' && $mode === 'planifiee') {
        foreach (PLANIFIEE_GRILLE as [$max, $montant]) if ($k <= $max) return [$k, $montant];
    }
    return [$k, EXPRESS_FORFAIT + max(0, $k - 6) * EXPRESS_KM_SUPP];
}

/** Une mission non acceptée dans les 3 minutes retourne à l'administration. */
function expire_missions(): void
{
    db()->exec("UPDATE commandes SET statut='en_attente', livreur_id=NULL, affecte_le=NULL
                WHERE statut='affectee' AND acceptee_le IS NULL AND affecte_le < (NOW() - INTERVAL " . ACCEPT_DELAI_SEC . " SECOND)");
}

function livreur_statut(array $l): string
{
    if ((int)($l['nb_missions'] ?? 0) > 0) return 'en_mission';
    if (!empty($l['pause_jusqua']) && strtotime($l['pause_jusqua']) > time()) return 'en_pause';
    return 'disponible';
}

function last_pos(int $livreurId): ?array
{
    $st = db()->prepare("SELECT latitude AS lat, longitude AS lng, source, enregistre_le AS at,
                                TIMESTAMPDIFF(SECOND, enregistre_le, NOW()) AS age
                         FROM positions_livreurs WHERE livreur_id=? ORDER BY id DESC LIMIT 1");
    $st->execute([$livreurId]);
    $p = $st->fetch();
    if (!$p) return null;
    $p['lat'] = (float)$p['lat']; $p['lng'] = (float)$p['lng'];
    $p['age'] = max(0, (int)$p['age']);
    $p['live'] = $p['age'] <= POSITION_LIVE_SEC;   // faux = dernière position connue, pas du direct
    return $p;
}

function next_code_boxiby(): string
{
    $n = (int)db()->query("SELECT COALESCE(MAX(CAST(SUBSTRING(code_boxiby,5) AS UNSIGNED)),0) FROM livreurs")->fetchColumn();
    return 'BXB-' . str_pad((string)($n + 1), 4, '0', STR_PAD_LEFT);
}

/* ---------- Paramètres globaux (numéros Mobile Money) ---------- */
function param(string $cle, string $defaut = ''): string
{
    try {
        $st = db()->prepare("SELECT valeur FROM parametres WHERE cle=?");
        $st->execute([$cle]);
        return (string)($st->fetchColumn() ?: $defaut);
    } catch (Throwable) { return $defaut; }
}

function set_param(string $cle, string $valeur): void
{
    db()->prepare("INSERT INTO parametres (cle, valeur) VALUES (?,?) ON DUPLICATE KEY UPDATE valeur=VALUES(valeur)")
        ->execute([$cle, $valeur]);
}

/** Le premier admin (plus petit id) est le seul à pouvoir changer les numéros de paiement. */
function premier_admin_id(): int
{
    return (int)db()->query("SELECT MIN(id) FROM utilisateurs WHERE role='admin' AND actif=1")->fetchColumn();
}

function payments_config(): array
{
    return ['mvola' => param('mvola'), 'orange' => param('orange'), 'airtel' => param('airtel')];
}

/**
 * Code USSD qui déclenche le paiement AUTOMATIQUEMENT depuis le compte Mobile Money du client :
 *   MVOLA         : #111*1*2*1*<numéro BOXIBY 10 chiffres>*<montant>#
 *   AIRTEL MONEY  : *436*2*1*1*<numéro BOXIBY 10 chiffres>*<montant>#
 *   ORANGE MONEY  : #144*1*1*<numéro BOXIBY 10 chiffres>*<montant>#
 */
function ussd_code(string $operateur, string $numero, int $montant): ?string
{
    $n = norm_tel($numero);
    if (!preg_match('/^0\d{9}$/', $n) || $montant <= 0) return null;
    return match ($operateur) {
        'mvola'  => "#111*1*2*1*$n*$montant#",
        'airtel' => "*436*2*1*1*$n*$montant#",
        'orange' => "#144*1*1*$n*$montant#",
        default  => null,
    };
}

function slugify(string $s): string
{
    $s = mb_strtolower(trim($s));
    $s = strtr($s, ['é'=>'e','è'=>'e','ê'=>'e','ë'=>'e','à'=>'a','â'=>'a','ä'=>'a','î'=>'i','ï'=>'i','ô'=>'o','ö'=>'o','ù'=>'u','û'=>'u','ü'=>'u','ç'=>'c','œ'=>'oe']);
    $s = trim(preg_replace('/[^a-z0-9]+/', '-', $s), '-');
    return $s !== '' ? substr($s, 0, 38) : 'type';
}
