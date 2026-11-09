<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Laravel\Sanctum\PersonalAccessToken;

/**
 * One active session (Sanctum token) shown in "Mis sesiones" / AD7.
 * Never exposes the token itself.
 *
 * @mixin PersonalAccessToken
 */
class SessionResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        $current = $request->user()?->currentAccessToken();

        return [
            'id' => $this->id,
            'device_name' => $this->name,
            'browser' => self::browser($this->user_agent),
            'platform' => self::platform($this->user_agent),
            'ip_address' => $this->ip_address,
            'created_at' => $this->created_at?->toIso8601String(),
            'last_used_at' => $this->last_used_at?->toIso8601String(),
            'expires_at' => $this->expires_at?->toIso8601String(),
            'is_current' => $current instanceof PersonalAccessToken && $current->is($this->resource),
        ];
    }

    public static function browser(?string $ua): string
    {
        return match (true) {
            $ua === null || $ua === '' => 'Desconocido',
            str_contains($ua, 'Edg/') => 'Edge',
            str_contains($ua, 'OPR/') => 'Opera',
            str_contains($ua, 'Chrome/') => 'Chrome',
            str_contains($ua, 'Firefox/') => 'Firefox',
            str_contains($ua, 'Safari/') => 'Safari',
            str_contains($ua, 'PostmanRuntime') => 'Postman',
            default => 'Otro',
        };
    }

    public static function platform(?string $ua): string
    {
        return match (true) {
            $ua === null || $ua === '' => 'Desconocido',
            str_contains($ua, 'Android') => 'Android',
            str_contains($ua, 'iPhone'), str_contains($ua, 'iPad') => 'iOS',
            str_contains($ua, 'Windows') => 'Windows',
            str_contains($ua, 'Mac OS') => 'macOS',
            str_contains($ua, 'Linux') => 'Linux',
            default => 'Otro',
        };
    }
}
