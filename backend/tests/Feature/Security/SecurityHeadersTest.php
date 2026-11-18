<?php

namespace Tests\Feature\Security;

use Database\Seeders\CatalogSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Encabezados de seguridad (OWASP) en todas las respuestas de la API, también en los errores.
 */
class SecurityHeadersTest extends TestCase
{
    use RefreshDatabase;

    protected string $seeder = CatalogSeeder::class;

    protected bool $seed = true;

    public function test_public_responses_have_the_security_headers(): void
    {
        $this->getJson('/api/v1/portal/info')
            ->assertOk()
            ->assertHeader('X-Content-Type-Options', 'nosniff')
            ->assertHeader('X-Frame-Options', 'DENY')
            ->assertHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'")
            ->assertHeader('Referrer-Policy', 'no-referrer')
            ->assertHeaderMissing('X-Powered-By')
            ->assertHeaderMissing('Strict-Transport-Security');

        $this->assertStringContainsString('no-store', $this->getJson('/api/v1/portal/info')->headers->get('Cache-Control'));
    }

    public function test_errors_also_have_them(): void
    {
        $this->getJson('/api/v1/auth/me')
            ->assertUnauthorized()
            ->assertJsonPath('code', 'UNAUTHENTICATED')
            ->assertHeader('X-Frame-Options', 'DENY')
            ->assertHeader('X-Content-Type-Options', 'nosniff');
    }

    public function test_hsts_only_over_https(): void
    {
        $this->getJson('https://localhost/api/v1/portal/info')
            ->assertHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
}
