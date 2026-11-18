<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Tu código de acceso a SHURI</title>
</head>
<body style="margin:0;padding:24px;background:#f4f5f7;font-family:Inter,Roboto,Arial,sans-serif;color:#1f2937;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;">
        <tr>
            <td style="padding:32px;">
                <p style="margin:0 0 4px;font-size:20px;font-weight:700;">SHURI</p>
                <p style="margin:0 0 24px;font-size:13px;color:#6b7280;">Reparaciones y Ventas</p>

                <p style="margin:0 0 16px;">Hola, {{ $name }}:</p>
                <p style="margin:0 0 16px;">Usa este código para terminar de iniciar sesión:</p>

                <p style="margin:0 0 16px;padding:16px;text-align:center;font-size:32px;font-weight:700;letter-spacing:8px;background:#f4f5f7;border-radius:8px;">{{ $code }}</p>

                <p style="margin:0 0 16px;font-size:14px;color:#4b5563;">El código vence en {{ $minutes }} minutos y solo se puede usar una vez.</p>

                <p style="margin:0;font-size:13px;color:#6b7280;">Si no fuiste tú quien intentó entrar, no compartas este código y avisa al administrador: alguien conoce tu contraseña.</p>
            </td>
        </tr>
    </table>
</body>
</html>
