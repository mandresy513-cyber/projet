<?php
/**
 * BOXIBY — Dépannage : crée les comptes admin si la base n'en contient aucun.
 * À ouvrir UNE fois dans le navigateur (comme install.php), puis SUPPRIMER ce fichier.
 * Mot de passe des comptes créés : Boxiby@2026 (à changer ensuite dans l'admin).
 */
declare(strict_types=1);
require __DIR__ . '/config.php';

const ADMINS = [
    ['Rakoto',  'Hery',     '0340000001', 'admin1@boxiby.mg'],
    ['Rabe',    'Voahangy', '0340000002', 'admin2@boxiby.mg'],
    ['Randria', 'Mamy',     '0340000003', 'admin3@boxiby.mg'],
    ['Rasoa',   'Lanto',    '0340000004', 'admin4@boxiby.mg'],
];
const ADMIN_PASS = 'Boxiby@2026';

try {
    $pdo = db();
    $nb = (int)$pdo->query("SELECT COUNT(*) FROM utilisateurs WHERE role='admin'")->fetchColumn();
    if ($nb > 0) {
        echo "<h2>Il y a déjà $nb admin(s) ✅</h2><p>Connectez-vous sur <a href='admin/index.php'>admin/index.php</a>. Supprimez ce fichier.</p>";
        exit;
    }
    $hash = password_hash(ADMIN_PASS, PASSWORD_DEFAULT);
    $ins  = $pdo->prepare("INSERT INTO utilisateurs (role,nom,prenom,telephone,email,mot_de_passe) VALUES ('admin',?,?,?,?,?)");
    foreach (ADMINS as [$n, $p, $t, $e]) $ins->execute([$n, $p, $t, $e, $hash]);
    echo '<h2>Comptes admin créés ✔</h2><p>Mot de passe : <b>' . ADMIN_PASS . '</b></p><ul>';
    foreach (ADMINS as [$n, $p, $t, $e]) echo "<li>$p $n — <b>$t</b> ou $e</li>";
    echo '</ul><p><a href="admin/index.php">Ouvrir l\'admin</a></p><p><b>Supprimez maintenant ce fichier (creer_admin.php).</b></p>';
} catch (Throwable $e) {
    http_response_code(500);
    echo '<h3>Erreur</h3><pre>' . htmlspecialchars($e->getMessage()) . '</pre>';
}
