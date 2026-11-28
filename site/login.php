<?php
declare(strict_types=1);
require __DIR__ . '/config.php';

// Si déjà connecté, redirection automatique
if (admin_me()) { header('Location: admin/'); exit; }
if (client_me()) { header('Location: index.php'); exit; }
if (livreur_me()) { header('Location: livreur/'); exit; }

$erreur = '';
$mode = ($_GET['mode'] ?? '') === 'inscription' ? 'inscription' : 'connexion';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $pdo = db();
    $do = $_POST['do'] ?? '';

    /* ============================================================
       CAS 1 : INSCRIPTION CLIENT
       ============================================================ */
    if ($do === 'inscription') {
        $mode = 'inscription';
        $nom = trim($_POST['nom'] ?? ''); $prenom = trim($_POST['prenom'] ?? '');
        $tel = norm_tel($_POST['telephone'] ?? ''); $mail = trim($_POST['email'] ?? '');
        $mdp = (string)($_POST['mot_de_passe'] ?? '');
        $ref = strtoupper(trim($_POST['reference'] ?? ''));

        $ex = $pdo->prepare("SELECT id, role, mot_de_passe FROM utilisateurs WHERE telephone = ?");
        $ex->execute([$tel]);
        $exist = $ex->fetch();

        // Compte créé automatiquement par une commande → réclamation avec référence
        if ($exist && $exist['role'] === 'client' && $exist['mot_de_passe'] === null && strlen($mdp) >= 6) {
            $ok = $pdo->prepare("SELECT 1 FROM commandes WHERE client_tel = ? AND reference = ?");
            $ok->execute([$tel, $ref]);
            if ($ok->fetchColumn()) {
                $pdo->prepare("UPDATE utilisateurs SET mot_de_passe = ? WHERE id = ?")
                    ->execute([password_hash($mdp, PASSWORD_DEFAULT), $exist['id']]);
                session_regenerate_id(true);
                $_SESSION['client_id'] = (int)$exist['id'];
                header('Location: index.php'); exit;
            }
            $erreur = "Ce numéro a déjà passé commande : indiquez la référence d'une de vos commandes (CMD-…) pour créer votre mot de passe.";
        } elseif ($exist) {
            $erreur = 'Ce numéro est déjà utilisé : connectez-vous.';
        } elseif ($nom === '' || $prenom === '' || !tel_ok($tel)) {
            $erreur = 'Nom, prénom et un numéro de téléphone valide sont obligatoires.';
        } elseif ($mail !== '' && !filter_var($mail, FILTER_VALIDATE_EMAIL)) {
            $erreur = 'Adresse e-mail invalide.';
        } elseif (strlen($mdp) < 6) {
            $erreur = 'Le mot de passe doit contenir au moins 6 caractères.';
        } else {
            try {
                $pdo->prepare("INSERT INTO utilisateurs (role,nom,prenom,telephone,email,mot_de_passe) VALUES ('client',?,?,?,?,?)")
                    ->execute([$nom, $prenom, $tel, $mail ?: null, password_hash($mdp, PASSWORD_DEFAULT)]);
                session_regenerate_id(true);
                $_SESSION['client_id'] = (int)$pdo->lastInsertId();
                header('Location: index.php'); exit;
            } catch (PDOException $e) {
                $erreur = 'Ce numéro ou cet e-mail est déjà utilisé.';
            }
        }
    }

    /* ============================================================
       CAS 2 : CONNEXION UNIFIÉE (détection automatique)
       - Si l'identifiant commence par "BXB-" → livreur (code BOXIBY + PIN)
       - Sinon → client ou admin (téléphone/email + mot de passe)
       ============================================================ */
    else {
        $mode = 'connexion';
        $id  = trim($_POST['identifiant'] ?? '');
        $mdp = (string)($_POST['mot_de_passe'] ?? '');

        if ($id === '' || $mdp === '') {
            $erreur = 'Veuillez remplir les deux champs.';
        }
        // === LIVREUR : identifiant commence par BXB- ===
        elseif (preg_match('/^BXB-/i', $id)) {
            $code = strtoupper($id);
            $st = $pdo->prepare("SELECT l.id, u.mot_de_passe, u.actif
                                 FROM livreurs l
                                 JOIN utilisateurs u ON u.id = l.utilisateur_id
                                 WHERE l.code_boxiby = ?");
            $st->execute([$code]);
            $l = $st->fetch();

            if ($l && $l['actif'] && password_verify($mdp, $l['mot_de_passe'])) {
                session_regenerate_id(true);
                $_SESSION['livreur_id'] = (int)$l['id'];
                header('Location: livreur/');
                exit;
            }
            usleep(800000);
            $erreur = 'Identifiant BOXIBY ou code secret incorrect.';
        }
        // === CLIENT ou ADMIN : téléphone ou email ===
        else {
            $st = $pdo->prepare("SELECT id, role, mot_de_passe FROM utilisateurs
                                 WHERE (telephone = ? OR email = ?) AND role IN ('admin','client') AND actif = 1");
            $st->execute([norm_tel($id), $id]);
            $u = $st->fetch();

            if ($u && $u['mot_de_passe'] !== null && password_verify($mdp, $u['mot_de_passe'])) {
                session_regenerate_id(true);
                if ($u['role'] === 'admin') {
                    $_SESSION['admin_id'] = (int)$u['id'];
                    header('Location: admin/');
                } else {
                    $_SESSION['client_id'] = (int)$u['id'];
                    header('Location: index.php');
                }
                exit;
            }
            usleep(800000);
            $erreur = 'Identifiant ou mot de passe incorrect.';
        }
    }
}
?>
<!DOCTYPE html>
<html lang="fr" data-theme="light">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
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
<title>Connexion — BOXIBY</title>
<link rel="stylesheet" href="assets/css/style.css">
<script>try{if(localStorage.getItem('bx-theme')==='dark')document.documentElement.dataset.theme='dark'}catch(e){}</script>
<style>
.login-hint {
    background: rgba(14,65,105,.06);
    border: 1px solid var(--line);
    border-left: 4px solid var(--blue);
    border-radius: 10px;
    padding: 10px 14px;
    font-size: 13px;
    color: var(--muted);
    margin-bottom: 16px;
    line-height: 1.5;
}
.login-hint b { color: var(--text); }
.login-hint code {
    background: var(--bg);
    padding: 2px 6px;
    border-radius: 4px;
    font-family: monospace;
    color: var(--orange);
    font-weight: 700;
}
</style>
</head>
<body class="login-body">
<div id="splash" aria-hidden="true"><img src="assets/img/logo.png" alt="BOXIBY Madagascar"><i class="bx-spin"></i></div>
<form class="login-card" method="post">
<a href="index.php" class="logo-plate big"><img src="assets/img/logo.png" alt="BOXIBY Madagascar"></a>

<?php if ($mode === 'inscription'): ?>

    <h1>Créer un compte client</h1>
    <input type="hidden" name="do" value="inscription">
    <?php if ($erreur): ?><p class="alert"><?= htmlspecialchars($erreur) ?></p><?php endif; ?>
    <div class="grid2">
        <label>Prénom <input name="prenom" required value="<?= htmlspecialchars($_POST['prenom'] ?? '') ?>"></label>
        <label>Nom <input name="nom" required value="<?= htmlspecialchars($_POST['nom'] ?? '') ?>"></label>
    </div>
    <label>Téléphone <input name="telephone" type="tel" required placeholder="034 00 000 00" value="<?= htmlspecialchars($_POST['telephone'] ?? '') ?>"></label>
    <label>E-mail (facultatif) <input name="email" type="email" value="<?= htmlspecialchars($_POST['email'] ?? '') ?>"></label>
    <label>Mot de passe <input name="mot_de_passe" type="password" required minlength="6"></label>
    <label>Référence d'une commande <small>(si vous avez déjà commandé)</small> <input name="reference" placeholder="CMD-…" value="<?= htmlspecialchars($_POST['reference'] ?? '') ?>"></label>
    <button class="btn primary block" type="submit">Créer mon compte</button>
    <p class="center"><a href="login.php">J'ai déjà un compte</a></p>

<?php else: ?>

    <h1>Connexion</h1>
    <?php if ($erreur): ?><p class="alert"><?= htmlspecialchars($erreur) ?></p><?php endif; ?>

    <label>Numero tél ou Email
        <input name="identifiant" required autofocus autocomplete="username"
               placeholder="Téléphone, e-mail ou BXB...">
    </label>
    <label>Mot de passe / Code secret
        <input name="mot_de_passe" type="password" required autocomplete="current-password"
               placeholder="Mot de passe ou code secret">
    </label>
    <button class="btn primary block" type="submit">Se connecter</button>
    <p class="center">
        <a href="login.php?mode=inscription">Créer un compte client</a> ·
        <a href="index.php">Commander sans compte</a>
    </p>

<?php endif; ?>
</form>
</body>
</html>