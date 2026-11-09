<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Recupera tu contraseña de SHURI</title>
</head>
<body style="margin:0;padding:24px;background:#f4f5f7;font-family:Inter,Roboto,Arial,sans-serif;color:#1f2937;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;">
        <tr>
            <td style="padding:32px;">
                <p style="margin:0 0 4px;font-size:20px;font-weight:700;">SHURI</p>
                <p style="margin:0 0 24px;font-size:13px;color:#6b7280;">Reparaciones y Ventas</p>

                <p style="margin:0 0 16px;">Hola, {{ $name }}:</p>
                <p style="margin:0 0 24px;">Recibimos una solicitud para cambiar tu contraseña. Presiona el botón para crear una nueva:</p>

                <p style="margin:0 0 24px;text-align:center;">
                    <a href="{{ $url }}" style="display:inline-block;padding:12px 24px;background:#1f2937;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;">Crear nueva contraseña</a>
                </p>

                <p style="margin:0 0 16px;font-size:14px;color:#4b5563;">
                    El enlace vence en {{ $minutes }} minutos y solo se puede usar una vez.
                    @if ($asksQuestion)
                        También te pediremos la respuesta a tu pregunta de seguridad.
                    @endif
                </p>

                <p style="margin:0;font-size:13px;color:#6b7280;">Si no pediste este cambio, ignora este correo: tu contraseña sigue siendo la misma.</p>
            </td>
        </tr>
    </table>
</body>
</html>
