<?php

namespace App\Services\Admin;

use App\Mail\StaffAccessMail;
use App\Models\Role;
use App\Models\User;
use App\Services\AuditService;
use App\Services\MailService;
use App\Services\SettingsService;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Usuarios y permisos (AD7 · RF-01, RF-14): alta, edición, baja y contraseña
 * temporal del personal. Cada cambio queda en la auditoría (sin contraseñas).
 * Nunca permite dejar el sistema sin un administrador activo.
 */
class UserService
{
    /** Campos que se registran en la auditoría al editar (nunca contraseñas ni claves). */
    private const AUDITED = [
        'role_id', 'cash_register_id', 'name', 'username', 'email', 'phone', 'specialty',
        'shift', 'start_time', 'end_time', 'max_discount_pct', 'two_factor_enabled', 'is_active',
    ];

    public function __construct(
        private readonly SettingsService $settings,
        private readonly AuditService $audit,
        private readonly MailService $mailer,
    ) {}

    /** @param  array<string, mixed>  $filters */
    public function paginate(array $filters): LengthAwarePaginator
    {
        return User::with(['role', 'cashRegister'])
            ->when($filters['search'] ?? null, function ($q, string $search) {
                $like = '%'.addcslashes($search, '%_\\').'%';
                $q->where(fn ($w) => $w->where('name', 'like', $like)->orWhere('username', 'like', $like)->orWhere('email', 'like', $like));
            })
            ->when($filters['role'] ?? null, fn ($q, string $slug) => $q->whereHas('role', fn ($r) => $r->where('slug', $slug)))
            ->when(array_key_exists('active', $filters) && $filters['active'] !== null, fn ($q) => $q->where('is_active', (bool) $filters['active']))
            ->orderByDesc('is_active')
            ->orderBy('name')
            ->paginate((int) ($filters['per_page'] ?? 20));
    }

    /**
     * Alta de un empleado con contraseña temporal (debe cambiarla al entrar, A.5).
     *
     * @param  array<string, mixed>  $data
     * @return array{user: User, temporary_password: string, email_sent: bool}
     */
    public function create(array $data, User $admin): array
    {
        $this->checkDiscount($data);
        $temporary = $this->temporaryPassword();

        $user = User::create($this->fillable($data) + [
            'password' => $temporary, // el cast del modelo aplica el hash
            'must_change_password' => true,
            'is_active' => true,
        ]);

        $this->audit->log('users', 'user_created', "Alta de {$user->username} como {$user->role->name}",
            $admin->id, 'users', $user->id, null, $user->only(self::AUDITED));

        $sent = $this->sendAccess($user, $temporary, true);

        return ['user' => $user->load(['role', 'cashRegister']), 'temporary_password' => $temporary, 'email_sent' => $sent];
    }

    /** @param  array<string, mixed>  $data */
    public function update(User $user, array $data, User $admin): User
    {
        $this->checkDiscount($data + ['role_id' => $user->role_id]);

        if (isset($data['role_id']) && (int) $data['role_id'] !== $user->role_id) {
            if ($user->id === $admin->id) {
                throw ValidationException::withMessages(['role_id' => 'No puedes cambiar tu propio rol.']);
            }
            $this->ensureAnotherAdmin($user, 'role_id', 'No puedes quitar el rol al único administrador activo.');
        }

        $before = $user->only(self::AUDITED);
        $user->fill($this->fillable($data));
        $codeChanged = ! empty($data['authorization_code']);
        $user->save();

        $changes = array_intersect_key($user->getChanges(), array_flip(self::AUDITED));

        if ($changes || $codeChanged) {
            $this->audit->log('users', 'user_updated', "Edición de {$user->username}".($codeChanged ? ' (nueva clave de autorización)' : ''),
                $admin->id, 'users', $user->id, array_intersect_key($before, $changes), $changes ?: null);
        }

        return $user->load(['role', 'cashRegister']);
    }

    /** Baja o alta del empleado. La baja cierra todas sus sesiones al instante. */
    public function setActive(User $user, bool $active, User $admin): User
    {
        if (! $active) {
            if ($user->id === $admin->id) {
                throw ValidationException::withMessages(['user' => 'No puedes desactivar tu propia cuenta.']);
            }
            $this->ensureAnotherAdmin($user, 'user', 'No puedes desactivar al único administrador activo.');
        }

        DB::transaction(function () use ($user, $active) {
            $user->forceFill(['is_active' => $active])->save();

            if (! $active) {
                $user->tokens()->delete();
            }
        });

        $this->audit->log('users', $active ? 'user_activated' : 'user_deactivated',
            ($active ? 'Reactivación' : 'Baja')." de {$user->username}", $admin->id, 'users', $user->id);

        return $user->load(['role', 'cashRegister']);
    }

    /**
     * AD7 "Asignar contraseña temporal": la cuenta se desbloquea y se cierran sus sesiones.
     *
     * @return array{user: User, temporary_password: string, email_sent: bool}
     */
    public function resetPassword(User $user, User $admin): array
    {
        $temporary = $this->temporaryPassword();

        DB::transaction(function () use ($user, $temporary) {
            $user->forceFill([
                'password' => $temporary,
                'must_change_password' => true,
                'failed_attempts' => 0,
                'locked_until' => null,
            ])->save();
            $user->tokens()->delete();
        });

        $this->audit->log('users', 'temporary_password_assigned', "Contraseña temporal asignada a {$user->username}",
            $admin->id, 'users', $user->id);

        $sent = $this->sendAccess($user, $temporary, false);

        return ['user' => $user->load(['role', 'cashRegister']), 'temporary_password' => $temporary, 'email_sent' => $sent];
    }

    /**
     * AD7.3 Matriz de permisos: qué puede hacer cada rol y con qué límite.
     *
     * @return Collection<int, Role>
     */
    public function roles(): Collection
    {
        return Role::with('permissions')->withCount(['users' => fn ($q) => $q->where('is_active', true)])->orderBy('id')->get();
    }

    /**
     * RF-14: el descuento máximo de alguien que no es administrador no pasa del tope configurado.
     *
     * @param  array<string, mixed>  $data
     */
    private function checkDiscount(array $data): void
    {
        if (! isset($data['max_discount_pct'])) {
            return;
        }

        $isAdmin = Role::whereKey($data['role_id'] ?? 0)->value('slug') === 'admin';
        $cap = (float) $this->settings->get('max_discount_cap_pct', 20);

        if (! $isAdmin && (float) $data['max_discount_pct'] > $cap) {
            throw ValidationException::withMessages([
                'max_discount_pct' => "El descuento máximo no puede pasar del {$cap}% (solo el administrador puede tener más).",
            ]);
        }
    }

    /** Evita dejar el sistema sin ningún administrador activo. */
    private function ensureAnotherAdmin(User $user, string $field, string $message): void
    {
        if ($user->role?->slug !== 'admin') {
            return;
        }

        $others = User::where('is_active', true)->whereKeyNot($user->id)
            ->whereHas('role', fn ($q) => $q->where('slug', 'admin'))
            ->exists();

        if (! $others) {
            throw ValidationException::withMessages([$field => $message]);
        }
    }

    /**
     * Solo los campos que el administrador puede capturar.
     *
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    private function fillable(array $data): array
    {
        $fields = array_intersect_key($data, array_flip([
            'role_id', 'cash_register_id', 'name', 'username', 'email', 'phone', 'specialty',
            'shift', 'start_time', 'end_time', 'max_discount_pct', 'two_factor_enabled',
        ]));

        // La clave de autorización solo se cambia si se envía (el cast del modelo aplica el hash)
        if (! empty($data['authorization_code'])) {
            $fields['authorization_code'] = $data['authorization_code'];
        }

        return $fields;
    }

    private function sendAccess(User $user, string $temporary, bool $isNew): bool
    {
        return $this->mailer->send(new StaffAccessMail(
            name: $user->name,
            username: $user->username,
            temporaryPassword: $temporary,
            roleName: $user->role->name,
            isNewAccount: $isNew,
            loginUrl: config('app.staff_login_url'),
        ), $user, 'temporary_password');
    }

    private function temporaryPassword(): string
    {
        return Str::password(10, letters: true, numbers: true, symbols: false);
    }
}
