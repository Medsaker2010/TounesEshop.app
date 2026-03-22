<?php
session_start();

/* =========================
   CONFIG
========================= */
$API_URL = "http://api-connect.icu/api/dev_api.php";
$API_KEY = "STR-8K-VIP-2026-X";
$STREAM_HOST = "http://my8k.me:8080";

/* =========================
   FUNCTION CREATE LINE
========================= */
function createLine($API_URL, $API_KEY) {
    $url = $API_URL . "?action=user&type=create&package_id=1&api_key=" . $API_KEY;

    $response = @file_get_contents($url);

    if (!$response) return false;

    return json_decode($response, true);
}

/* =========================
   PAYMENT SIMULATION / SUCCESS
========================= */
if (isset($_GET['pay'])) {

    // 👉 ICI normalement Stripe webhook
    $line = createLine($API_URL, $API_KEY);

    if ($line && isset($line['username'])) {
        $_SESSION['access'] = [
            "user" => $line['username'],
            "pass" => $line['password'],
            "link" => $STREAM_HOST . "/get.php?user=".$line['username']."&pass=".$line['password']."&type=m3u_plus"
        ];
    }

    header("Location: index.php");
    exit;
}
?>

<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>TES SAT</title>

<style>
body {
    margin:0;
    font-family: Arial;
    background:black;
    color:#FFD700;
    text-align:center;
}

/* Satellite effect */
.satellite {
    width:120px;
    height:120px;
    border-radius:50%;
    background:gold;
    margin:40px auto;
    animation: rotate 6s linear infinite;
}

@keyframes rotate {
    from {transform: rotate(0deg);}
    to {transform: rotate(360deg);}
}

.btn {
    padding:15px 30px;
    background:#FFD700;
    color:black;
    border:none;
    font-size:18px;
    border-radius:10px;
    cursor:pointer;
}

.box {
    margin-top:30px;
}
</style>
</head>

<body>

<h1>TES SAT</h1>
<p>Console VIP Streaming</p>

<div class="satellite"></div>

<?php if (!isset($_SESSION['access'])): ?>

    <!-- ================= LANDING ================= -->

    <a href="?pay=1">
        <button class="btn">ACCÈS VIP – 5.55€</button>
    </a>

<?php else: ?>

    <!-- ================= DASHBOARD ================= -->

    <div class="box">
        <h2>Accès Activé</h2>

        <p><b>Username:</b> <?php echo $_SESSION['access']['user']; ?></p>
        <p><b>Password:</b> <?php echo $_SESSION['access']['pass']; ?></p>

        <p><b>Lien:</b></p>
        <a href="<?php echo $_SESSION['access']['link']; ?>" target="_blank">
            <?php echo $_SESSION['access']['link']; ?>
        </a>

        <br><br>

        <!-- QR CODE UNIQUEMENT APRÈS PAIEMENT -->
        <img src="https://api.qrserver.com/v1/create-qr-code/?data=<?php echo urlencode($_SESSION['access']['link']); ?>" />

    </div>

<?php endif; ?>

</body>
</html>
