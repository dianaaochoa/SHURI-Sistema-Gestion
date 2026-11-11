<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;

/**
 * Folios consecutivos por tipo y año, sin huecos ni duplicados
 * (README §15.2, tabla `sequences`). P. ej. OS-2026-00001.
 *
 * La fila de la secuencia se bloquea (SELECT … FOR UPDATE) para que dos cajas
 * que reciben equipos al mismo tiempo nunca obtengan el mismo folio.
 * Registrado como singleton en AppServiceProvider.
 */
class FolioService
{
    /** @var array<string, string> nombre de la secuencia => prefijo del folio */
    private const PREFIXES = [
        'service_order' => 'OS',
        'sale' => 'V',
        'quote' => 'COT',
        'part_request' => 'SR',
        'purchase' => 'C',
        'purchase_order' => 'PP',
        'warranty' => 'GAR',
        'sale_return' => 'DEV',
        'credit_note' => 'NC',
        'cash_closing' => 'CC',
        'cash_withdrawal' => 'RET',
    ];

    /** Se debe llamar dentro de la misma transacción que guarda el registro. */
    public function next(string $sequence): string
    {
        $prefix = self::PREFIXES[$sequence] ?? throw new \InvalidArgumentException("Secuencia desconocida: {$sequence}");
        $year = (int) now()->format('Y');

        return DB::transaction(function () use ($sequence, $year, $prefix) {
            // Primer folio de un año nuevo: crea su contador
            DB::table('sequences')->insertOrIgnore(['name' => $sequence, 'year' => $year, 'value' => 0]);

            $current = (int) DB::table('sequences')
                ->where('name', $sequence)
                ->where('year', $year)
                ->lockForUpdate()
                ->value('value');

            $next = $current + 1;
            DB::table('sequences')->where('name', $sequence)->where('year', $year)->update(['value' => $next]);

            return sprintf('%s-%d-%05d', $prefix, $year, $next);
        });
    }
}
