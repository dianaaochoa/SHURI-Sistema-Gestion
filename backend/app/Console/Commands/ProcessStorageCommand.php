<?php

namespace App\Console\Commands;

use App\Services\Workshop\StorageService;
use Illuminate\Console\Command;

/**
 * Proceso diario de resguardo (RF-09): avisos de almacenaje y de abandono por correo,
 * y paso a "En Abandono" de los equipos que cumplieron el plazo (sp_process_storage).
 */
class ProcessStorageCommand extends Command
{
    protected $signature = 'shuri:process-storage';

    protected $description = 'Envía los avisos de almacenaje y marca En Abandono los equipos sin recoger';

    public function handle(StorageService $storage): int
    {
        $result = $storage->process();

        $this->info("Avisos de almacenaje: {$result['storage_fee_notices']}");
        $this->info("Avisos de abandono: {$result['abandonment_notices']}");
        $this->info('Equipos en abandono: '.count($result['abandoned']).($result['abandoned'] ? ' ('.implode(', ', $result['abandoned']).')' : ''));

        return self::SUCCESS;
    }
}
