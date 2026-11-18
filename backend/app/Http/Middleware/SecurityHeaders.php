<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Encabezados de seguridad recomendados por OWASP para una API REST
 * (OWASP Secure Headers Project y REST Security Cheat Sheet).
 */
class SecurityHeaders
{
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);

        $headers = [
            // El navegador no "adivina" el tipo de contenido (evita ejecutar JSON como HTML o script)
            'X-Content-Type-Options' => 'nosniff',
            // La API no se puede cargar dentro de un iframe (clickjacking)
            'X-Frame-Options' => 'DENY',
            // La API solo entrega datos: no carga scripts, estilos ni marcos de ningún origen
            'Content-Security-Policy' => "default-src 'none'; frame-ancestors 'none'",
            // No se envía la URL de la API (con folios) a otros sitios
            'Referrer-Policy' => 'no-referrer',
            // Sin acceso a cámara, micrófono ni ubicación
            'Permissions-Policy' => 'camera=(), microphone=(), geolocation=()',
            // Las respuestas tienen datos personales: ni el navegador ni un proxy las guardan
            'Cache-Control' => 'no-store, private',
        ];

        foreach ($headers as $name => $value) {
            $response->headers->set($name, $value);
        }

        // Solo con HTTPS: obliga al navegador a usar siempre conexión segura
        if ($request->isSecure()) {
            $response->headers->set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
        }

        // No revelar la versión de PHP
        $response->headers->remove('X-Powered-By');
        header_remove('X-Powered-By');

        return $response;
    }
}
