<?php
/**
 * BOXIBY — Installation (à lancer UNE fois, puis supprimer ce fichier).
 *   install.php          : base + 4 comptes admin
 *   install.php?demo=1   : ajoute des livreurs / partenaires de démonstration
 *   install.php?reset=1  : repart de zéro (efface la base boxiby)
 */
declare(strict_types=1);
require __DIR__ . '/config.php';

if (is_file(__DIR__ . '/install.lock') && !isset($_GET['reset']) && !isset($_GET['demo'])) exit('Déjà installé. Supprimez install.php.');

/* ===== Les 4 comptes admin déjà inscrits (modifiez ici avant l'installation) ===== */
const ADMINS = [
    ['Rakoto',  'Hery',     '0340000001', 'admin1@boxiby.mg'],
    ['Rabe',    'Voahangy', '0340000002', 'admin2@boxiby.mg'],
    ['Randria', 'Mamy',     '0340000003', 'admin3@boxiby.mg'],
    ['Rasoa',   'Lanto',    '0340000004', 'admin4@boxiby.mg'],
];
const ADMIN_PASS = 'Boxiby@2026';

try {
    $pdo = new PDO('mysql:host=' . DB_HOST . ';charset=utf8mb4', DB_USER, DB_PASS, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    $pdo->exec("SET time_zone = '+03:00'");   // même fuseau que l'application (Madagascar)
    if (isset($_GET['reset'])) $pdo->exec('DROP DATABASE IF EXISTS ' . DB_NAME);

    $sql = preg_replace('/^\s*--.*$/m', '', file_get_contents(__DIR__ . '/database/boxiby.sql'));
    $sql = preg_replace('/--[^\n]*/', '', $sql);                     // commentaires en fin de ligne
    foreach (array_filter(array_map('trim', explode(';', $sql))) as $stmt) $pdo->exec($stmt);
    $pdo->exec('USE ' . DB_NAME);

    $hash = password_hash(ADMIN_PASS, PASSWORD_DEFAULT);
    $ins  = $pdo->prepare("INSERT INTO utilisateurs (role,nom,prenom,telephone,email,mot_de_passe) VALUES ('admin',?,?,?,?,?)
                           ON DUPLICATE KEY UPDATE nom=VALUES(nom), prenom=VALUES(prenom)");
    foreach (ADMINS as [$n, $p, $t, $e]) $ins->execute([$n, $p, $t, $e, $hash]);

    if (isset($_GET['demo'])) {
        $pin = password_hash('123456', PASSWORD_DEFAULT);
        $mkUser = $pdo->prepare("INSERT IGNORE INTO utilisateurs (role,nom,prenom,telephone,mot_de_passe) VALUES ('livreur',?,?,?,?)");
        $getUid = $pdo->prepare("SELECT id FROM utilisateurs WHERE telephone = ?");
        $mkLiv  = $pdo->prepare("INSERT IGNORE INTO livreurs (utilisateur_id,code_im,code_boxiby,gps_moto,tracer_telephone) VALUES (?,?,?,?,?)");
        $getLiv = $pdo->prepare("SELECT id FROM livreurs WHERE code_boxiby = ?");
        $mkPos  = $pdo->prepare("INSERT INTO positions_livreurs (livreur_id,latitude,longitude,source) VALUES (?,?,?,?)");
        foreach ([['RAKOTO','Jean','0341100001','IM-001','BXB-0001','GPS-A101',1,-18.9100,47.5250],
                  ['RABE','Haja','0332200002','IM-002','BXB-0002','GPS-A102',0,-18.8700,47.5000]] as [$n,$p,$t,$im,$bx,$g,$tr,$la,$lo]) {
            $mkUser->execute([$n, $p, $t, $pin]);
            $getUid->execute([$t]); $uid = (int)$getUid->fetchColumn();          // fiable même si le compte existait déjà
            $mkLiv->execute([$uid, $im, $bx, $g, $tr]);
            $getLiv->execute([$bx]); $lid = (int)$getLiv->fetchColumn();
            if ($lid) $mkPos->execute([$lid, $la, $lo, $tr ? 'telephone' : 'moto']);
        }
        if (!(int)$pdo->query("SELECT COUNT(*) FROM partenaires")->fetchColumn()) {
            $pdo->exec("INSERT INTO partenaires (type_id,nom,adresse,latitude,longitude) VALUES
                ((SELECT id FROM types_partenaires WHERE code='pharmacie'),'Pharmacie Analakely','Analakely, Antananarivo',-18.9065,47.5255),
                ((SELECT id FROM types_partenaires WHERE code='restaurant'),'Restaurant La Table','Isoraka, Antananarivo',-18.9150,47.5190),
                ((SELECT id FROM types_partenaires WHERE code='magasin'),'Supermarché Jumbo Score','Ankorondrano, Antananarivo',-18.8790,47.5260)");
            // Options facultatives : barquette (restaurant) et sachet (grande surface)
            $pdo->exec("INSERT INTO options_partenaire (partenaire_id,nom,prix) VALUES
                ((SELECT id FROM partenaires WHERE nom='Restaurant La Table'),'Barquette',500),
                ((SELECT id FROM partenaires WHERE nom='Supermarché Jumbo Score'),'Sachet',100)");
            $art = $pdo->prepare("INSERT INTO articles (partenaire_id,nom,description,prix,option_id) VALUES
                ((SELECT id FROM partenaires WHERE nom=?),?,?,?,(SELECT id FROM options_partenaire WHERE nom=? AND partenaire_id=(SELECT id FROM partenaires WHERE nom=?)))");
            foreach ([['Restaurant La Table','Romazava','Bouillon de viande et brèdes, riz inclus',8000,'Barquette'],
                      ['Restaurant La Table','Poulet coco','Poulet mijoté au lait de coco',9500,'Barquette'],
                      ['Restaurant La Table','Jus de fruit frais','Bouteille 50 cl',2500,null],
                      ['Supermarché Jumbo Score','Riz 5 kg','Riz local de qualité',22000,'Sachet'],
                      ['Supermarché Jumbo Score','Huile 1 L','Huile de cuisine',7500,'Sachet']] as [$pn,$n,$d,$pr,$op]) $art->execute([$pn,$n,$d,$pr,$op,$pn]);
        }
    }
    file_put_contents(__DIR__ . '/install.lock', date('c'));
    echo '<h2>Installation terminée ✔</h2><p>Comptes déjà inscrits (mot de passe : <b>' . ADMIN_PASS . '</b>) :</p><ul>';
    foreach (ADMINS as [$n, $p, $t, $e]) echo "<li>$p $n — <b>$t</b> ou $e</li>";
    echo '</ul>' . (isset($_GET['demo']) ? '<p>Livreurs de démonstration : BXB-0001 / BXB-0002, code secret <b>123456</b> (connexion : <code>../login.php</code>).</p>' : '')
       . '<p><a href="login.php">Connexion</a> — supprimez ensuite <code>install.php</code> et changez les mots de passe.</p>';
} catch (Throwable $e) {
    http_response_code(500);
    echo '<h3>Erreur</h3><pre>' . htmlspecialchars($e->getMessage()) . '</pre>';
}
