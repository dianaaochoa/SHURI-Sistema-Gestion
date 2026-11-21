<?php

namespace App\Console\Commands;

use App\Models\Role;
use App\Models\User;
use App\Services\AuditService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Regresa la cuenta de Super usuario a su primer ingreso: contraseña temporal nueva,
 * sin pregunta secreta, sin bloqueo y sin sesiones abiertas.
 *
 * Es la salida de emergencia si olvida su contraseña: ningún administrador puede
 * asignarle una temporal. No borra la cuenta, porque la auditoría es inmutable.
 */
class ResetSuperUserCommand extends Command
{
    protected $signature = 'shuri:reset-superuser {--force : No pedir confirmación}';

    protected $description = 'Asigna una contraseña temporal al Super usuario y lo regresa a su primer ingreso';

    public function handle(AuditService $audit): int
    {
        $user = User::whereHas('role', fn ($q) => $q->where('slug', Role::SUPER_ADMIN))->first();

        if (! $user) {
            $this->error('No existe el Super usuario. Créalo con: php artisan shuri:create-superuser');

            return self::FAILURE;
        }

        if (! $this->option('force') && ! $this->confirm("¿Regresar a {$user->username} a su primer ingreso? Se cerrarán sus sesiones.", true)) {
            $this->line('No se cambió nada.');

            return self::SUCCESS;
        }

        $temporary = Str::password(12, letters: true, numbers: true, symbols: false);

        DB::transaction(function () use ($user, $temporary) {
            $user->forceFill([
                'password' => $temporary, // el cast del modelo aplica el hash
                'must_change_password' => true,
                'security_question' => null,
                'security_answer_hash' => null,
                'failed_attempts' => 0,
                'locked_until' => null,
                'is_active' => true,
            ])->save();

            $user->tokens()->delete();
            DB::table('two_factor_challenges')->where('user_id', $user->id)->delete();
        });

        $audit->log('users', 'super_user_reset', "Super usuario {$user->username} regresado a su primer ingreso desde la consola", null, 'users', $user->id);

        $this->info("Listo: {$user->username} vuelve a su primer ingreso.");
        $this->line("Contraseña temporal: <comment>{$temporary}</comment>");
        $this->line("Al entrar llegará el código MFA a {$user->email} y te pedirá crear tu contraseña y tu pregunta secreta.");

        return self::SUCCESS;
    }
}
