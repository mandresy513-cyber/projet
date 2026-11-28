<?php
require __DIR__ . '/config.php';
$_SESSION = []; session_destroy();
header('Location: ' . (($_GET['to'] ?? '') === 'livreur' ? '../login.php' : 'login.php'));
