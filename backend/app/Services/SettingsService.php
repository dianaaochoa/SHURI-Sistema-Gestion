<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;

/**
 * Reads the `settings` table (key = value) with typed values.
 *
 * Registered as a singleton in AppServiceProvider (Singleton pattern):
 * the table is loaded once per request and every service shares the
 * same instance instead of hitting the database for each key.
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

    /** Forget the loaded values (after the admin edits the settings). */
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
