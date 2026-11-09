<?php

namespace App\Support;

use Illuminate\Support\Str;

/**
 * Fixed catalog of security questions used for password recovery.
 * Only the key is stored; free-text questions tend to be weak.
 */
final class SecurityQuestions
{
    /** @var array<string, string> */
    public const ALL = [
        'first_pet' => '¿Cómo se llamaba tu primera mascota?',
        'birth_city' => '¿En qué ciudad naciste?',
        'first_school' => '¿Cómo se llamaba tu escuela primaria?',
        'childhood_friend' => '¿Cómo se llama tu mejor amigo(a) de la infancia?',
        'favorite_teacher' => '¿Cuál es el apellido de tu maestro(a) favorito(a)?',
        'first_job' => '¿En qué empresa fue tu primer trabajo?',
    ];

    public static function text(?string $key): ?string
    {
        return $key ? (self::ALL[$key] ?? null) : null;
    }

    /** @return array<int, string> */
    public static function keys(): array
    {
        return array_keys(self::ALL);
    }

    /** "  Firulaís " and "firulais" are the same answer. */
    public static function normalize(string $answer): string
    {
        return Str::of($answer)->ascii()->lower()->squish()->value();
    }
}
