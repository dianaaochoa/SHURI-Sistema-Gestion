<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Tu contraseña temporal de SHURI</title>
</head>
<body style="margin:0;padding:24px;background:#f4f5f7;font-family:Inter,Roboto,Arial,sans-serif;color:#1f2937;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;">
        <tr>
            <td style="padding:32px;">
                <p style="margin:0 0 4px;font-size:20px;font-weight:700;">SHURI</p>
                <p style="margin:0 0 24px;font-size:13px;color:#6b7280;">Reparaciones y Ventas</p>

                <p style="margin:0 0 16px;">Hola, {{ $name }}:</p>
                <p style="margin:0 0 16px;">Respondiste correctamente tu pregunta de seguridad. Entra con estos datos:</p>

                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 16px;background:#f4f5f7;border-radius:8px;">
                    <tr>
                        <td style="padding:16px;font-size:14px;">
                            <p style="margin:0 0 8px;color:#6b7280;">Usuario</p>
                            <p style="margin:0 0 16px;font-weight:600;">{{ $login }}</p>
                            <p style="margin:0 0 8px;color:#6b7280;">Contraseña temporal</p>
                            <p style="margin:0;font-size:22px;font-weight:700;letter-spacing:2px;font-family:Consolas,monospace;">{{ $temporaryPassword }}</p>
                        </td>
                    </tr>
                </table>

                <p style="margin:0 0 16px;font-size:14px;color:#4b5563;">Al entrar te pediremos crear tu nueva contraseña. Por seguridad cerramos tu sesión en todos los dispositivos.</p>

                <p style="margin:0;font-size:13px;color:#6b7280;">Si no pediste este cambio, comunícate de inmediato con la sucursal: alguien conoce la respuesta a tu pregunta de seguridad.</p>
            </td>
        </tr>
    </table>
</body>
</html>
