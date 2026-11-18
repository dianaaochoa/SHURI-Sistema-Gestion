<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Recibimos tu equipo · Folio {{ $folio }}</title>
</head>
<body style="margin:0;padding:24px;background:#f4f5f7;font-family:Inter,Roboto,Arial,sans-serif;color:#1f2937;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;">
        <tr>
            <td style="padding:32px;">
                <p style="margin:0 0 4px;font-size:20px;font-weight:700;">SHURI</p>
                <p style="margin:0 0 24px;font-size:13px;color:#6b7280;">Reparaciones y Ventas</p>

                <p style="margin:0 0 16px;">Hola, {{ $customerName }}:</p>
                <p style="margin:0 0 16px;">Tu equipo ha sido ingresado correctamente en nuestras instalaciones y está en cola para evaluación.</p>

                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 16px;background:#f4f5f7;border-radius:8px;">
                    <tr>
                        <td style="padding:16px;font-size:14px;">
                            <p style="margin:0 0 8px;color:#6b7280;">Folio</p>
                            <p style="margin:0 0 16px;font-size:20px;font-weight:700;">{{ $folio }}</p>
                            <p style="margin:0 0 8px;color:#6b7280;">Equipo</p>
                            <p style="margin:0;font-weight:600;">{{ $device }}</p>
                        </td>
                    </tr>
                </table>

                @if ($temporaryPassword)
                    <p style="margin:0 0 8px;">Puedes seguir el avance de tu reparación en nuestro portal:</p>
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 16px;border:1px solid #e5e7eb;border-radius:8px;">
                        <tr>
                            <td style="padding:16px;font-size:14px;">
                                <p style="margin:0 0 4px;color:#6b7280;">Correo</p>
                                <p style="margin:0 0 12px;font-weight:600;">{{ $email }}</p>
                                <p style="margin:0 0 4px;color:#6b7280;">Contraseña temporal</p>
                                <p style="margin:0;font-size:20px;font-weight:700;letter-spacing:2px;font-family:Consolas,monospace;">{{ $temporaryPassword }}</p>
                            </td>
                        </tr>
                    </table>
                    <p style="margin:0 0 16px;font-size:14px;color:#4b5563;">Al entrar te pediremos crear tu propia contraseña. La contraseña temporal también viene impresa en tu hoja de recepción.</p>
                @else
                    <p style="margin:0 0 16px;">Sigue el avance de tu reparación entrando al portal con tu correo y tu contraseña.</p>
                @endif

                <p style="margin:0 0 24px;text-align:center;">
                    <a href="{{ $portalUrl }}" style="display:inline-block;padding:12px 24px;background:#1f2937;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;">Ver mi equipo</a>
                </p>

                <p style="margin:0;font-size:13px;color:#6b7280;">La recepción y entrega se realizan únicamente en la sucursal. Si tienes dudas, escríbenos por el chat del portal.</p>
            </td>
        </tr>
    </table>
</body>
</html>
