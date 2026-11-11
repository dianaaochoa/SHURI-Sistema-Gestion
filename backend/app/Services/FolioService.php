<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;

/**
 * Consecutive folios per type and year, without gaps or duplicates
 * (README §15.2, table `sequences`). E.g. OS-2026-00001.
 *
 * The sequence row is locked (SELECT … FOR UPDATE) so two cash registers
 * receiving devices at the same time never get the same folio.
 * Registered as a singleton in AppServiceProvider.
 */
class FolioService
{
    /** @var array<string, string> sequence name => folio prefix */
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

    /** Must be called inside the same DB transaction that saves the record. */
    public function next(string $sequence): string
    {
        $prefix = self::PREFIXES[$sequence] ?? throw new \InvalidArgumentException("Secuencia desconocida: {$sequence}");
        $year = (int) now()->format('Y');

        return DB::transaction(function () use ($sequence, $year, $prefix) {
            // First folio of a new year: create its counter
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
