<?php

namespace App\Console\Commands;

use App\Models\Role;
use App\Models\User;
use App\Services\AuditService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;

/**
 * Crea la única cuenta de Super usuario. No se puede crear desde la pantalla de usuarios,
 * así que se hace aquí, en el servidor. La contraseña es temporal: al entrar pide crear la propia.
 */
class CreateSuperUserCommand extends Command
{
    protected $signature = 'shuri:create-superuser
                            {username : Usuario para iniciar sesión (minúsculas)}
                            {email : Correo donde llegan los códigos MFA}
                            {name : Nombre completo}';

    protected $description = 'Crea la cuenta de Super usuario (solo puede existir una)';

    public function handle(AuditService $audit): int
    {
        $role = Role::where('slug', Role::SUPER_ADMIN)->first();

        if (! $role) {
            $this->error('No existe el rol Super usuario. Corre primero: php artisan migrate');

            return self::FAILURE;
        }

        $existing = User::where('role_id', $role->id)->first();
        if ($existing) {
            $this->error("Ya existe el Super usuario ({$existing->username}). Solo puede haber uno.");

            return self::FAILURE;
        }

        $data = [
            'username' => mb_strtolower(trim($this->argument('username'))),
            'email' => mb_strtolower(trim($this->argument('email'))),
            'name' => trim($this->argument('name')),
        ];

        $validator = Validator::make($data, [
            'username' => ['required', 'min:3', 'max:40', 'regex:/^[a-z0-9._-]+$/', 'unique:users,username'],
            'email' => ['required', 'email', 'max:150', 'unique:users,email'],
            'name' => ['required', 'max:150'],
        ], [], ['username' => 'usuario', 'email' => 'correo', 'name' => 'nombre']);

        if ($validator->fails()) {
            foreach ($validator->errors()->all() as $message) {
                $this->error($message);
            }

            return self::FAILURE;
        }

        $temporary = Str::password(12, letters: true, numbers: true, symbols: false);

        $user = User::create($data + [
            'role_id' => $role->id,
            'password' => $temporary, // el cast del modelo aplica el hash
            'must_change_password' => true,
            'two_factor_enabled' => true,
            'max_discount_pct' => 100,
            'is_active' => true,
        ]);

        $audit->log('users', 'super_user_created', "Alta del Super usuario {$user->username} desde la consola", null, 'users', $user->id);

        $this->info("Super usuario {$user->username} creado.");
        $this->line("Contraseña temporal: <comment>{$temporary}</comment>");
        $this->line('Al entrar, el sistema te pedirá el código MFA de tu correo y crear tu propia contraseña.');

        return self::SUCCESS;
    }
}
