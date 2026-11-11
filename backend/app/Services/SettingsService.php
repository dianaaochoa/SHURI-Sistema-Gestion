<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;

/**
 * Lee la tabla `settings` (clave = valor) con valores tipados.
 *
 * Registrado como singleton en AppServiceProvider (patrón Singleton):
 * la tabla se carga una vez por petición y todos los servicios comparten
 * la misma instancia en lugar de consultar la base de datos por cada clave.
 */
class SettingsService
{
    /** @var array<string, mixed>|null */
    private ?array $cache = null;

    public function get(string $key, mixed $default = null): mixed
    {
        $this->cache ??= $this->load();

        return array_key_exists($key, $this->cache) ? $this->cache[$key] : $default;
    }

    public function int(string $key, int $default): int
    {
        return (int) $this->get($key, $default);
    }

    /** Olvida los valores cargados (después de que el administrador edita la configuración). */
    public function refresh(): void
    {
        $this->cache = null;
    }

    /** @return array<string, mixed> */
    private function load(): array
    {
        return DB::table('settings')->get(['key', 'value', 'type'])
            ->mapWithKeys(fn ($row) => [$row->key => $this->cast($row->value, $row->type)])
            ->all();
    }

    private function cast(?string $value, ?string $type): mixed
    {
        return match ($type) {
            'integer' => (int) $value,
            'decimal' => (float) $value,
            'boolean' => filter_var($value, FILTER_VALIDATE_BOOLEAN),
            default => $value,
        };
    }
}
