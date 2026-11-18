<?php

namespace App\Console;

use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Foundation\Console\Kernel as ConsoleKernel;

class Kernel extends ConsoleKernel
{
    /**
     * Define the application's command schedule.
     */
    protected function schedule(Schedule $schedule): void
    {
        // Borra los tokens de Sanctum que vencieron hace más de 24 h
        $schedule->command('sanctum:prune-expired --hours=24')->daily();
        // Borra los retos MFA viejos (modelos con el trait Prunable)
        $schedule->command('model:prune')->daily();
        // RF-09: avisos de almacenaje y paso a "En Abandono" antes de abrir la sucursal
        $schedule->command('shuri:process-storage')->dailyAt('08:00')->withoutOverlapping();
    }

    /**
     * Register the commands for the application.
     */
    protected function commands(): void
    {
        $this->load(__DIR__.'/Commands');

        require base_path('routes/console.php');
    }
}
