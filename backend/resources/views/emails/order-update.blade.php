<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{{ $subjectLine }}</title>
</head>
<body style="margin:0;padding:24px;background:#f4f5f7;font-family:Inter,Roboto,Arial,sans-serif;color:#1f2937;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;">
        <tr>
            <td style="padding:32px;">
                <p style="margin:0 0 4px;font-size:20px;font-weight:700;">SHURI</p>
                <p style="margin:0 0 24px;font-size:13px;color:#6b7280;">Reparaciones y Ventas · Folio {{ $folio }}</p>

                <p style="margin:0 0 8px;font-size:18px;font-weight:700;">{{ $title }}</p>
                <p style="margin:0 0 16px;">Hola, {{ $customerName }}:</p>
                <p style="margin:0 0 16px;">{{ $body }}</p>

                @if (count($details))
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 16px;background:#f4f5f7;border-radius:8px;">
                        @foreach ($details as $label => $value)
                            <tr>
                                <td style="padding:8px 16px;font-size:14px;color:#6b7280;">{{ $label }}</td>
                                <td style="padding:8px 16px;font-size:14px;font-weight:600;text-align:right;">{{ $value }}</td>
                            </tr>
                        @endforeach
                    </table>
                @endif

                <p style="margin:0 0 24px;text-align:center;">
                    <a href="{{ $portalUrl }}" style="display:inline-block;padding:12px 24px;background:#1f2937;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;">{{ $buttonText }}</a>
                </p>

                <p style="margin:0;font-size:13px;color:#6b7280;">La recepción y entrega se realizan únicamente en la sucursal. Si tienes dudas, escríbenos por el chat del portal.</p>
            </td>
        </tr>
    </table>
</body>
</html>
