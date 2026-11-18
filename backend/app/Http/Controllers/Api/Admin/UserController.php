<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\UserRequest;
use App\Http\Resources\AdminUserResource;
use App\Models\User;
use App\Services\Admin\UserService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

/**
 * AD7 Usuarios y permisos (RF-01, RF-14). Rutas protegidas con permission:users.manage.
 */
class UserController extends Controller
{
    public function __construct(private readonly UserService $users) {}

    /** GET /users?search=&role=&active= */
    public function index(Request $request): AnonymousResourceCollection
    {
        $filters = $request->validate([
            'search' => ['nullable', 'string', 'max:100'],
            'role' => ['nullable', 'string', 'exists:roles,slug'],
            'active' => ['nullable', 'boolean'],
            'per_page' => ['nullable', 'integer', 'min:5', 'max:100'],
        ]);

        return AdminUserResource::collection($this->users->paginate($filters));
    }

    /** GET /users/{user} */
    public function show(User $user): AdminUserResource
    {
        return new AdminUserResource($user->load(['role', 'cashRegister']));
    }

    /** POST /users — alta con contraseña temporal */
    public function store(UserRequest $request): JsonResponse
    {
        $result = $this->users->create($request->validated(), $request->user());

        return response()->json([
            'message' => "Usuario {$result['user']->username} creado. Debe cambiar su contraseña al entrar.",
            'data' => new AdminUserResource($result['user']),
            // Se muestra una sola vez para entregarla en persona si el correo no llega
            'temporary_password' => $result['temporary_password'],
            'email_sent' => $result['email_sent'],
        ], 201);
    }

    /** PUT /users/{user} */
    public function update(UserRequest $request, User $user): JsonResponse
    {
        return response()->json([
            'message' => 'Usuario actualizado.',
            'data' => new AdminUserResource($this->users->update($user, $request->validated(), $request->user())),
        ]);
    }

    /** POST /users/{user}/deactivate — baja: cierra todas sus sesiones */
    public function deactivate(Request $request, User $user): JsonResponse
    {
        return response()->json([
            'message' => "{$user->name} ya no puede entrar al sistema.",
            'data' => new AdminUserResource($this->users->setActive($user, false, $request->user())),
        ]);
    }

    /** POST /users/{user}/activate */
    public function activate(Request $request, User $user): JsonResponse
    {
        return response()->json([
            'message' => "{$user->name} puede volver a entrar al sistema.",
            'data' => new AdminUserResource($this->users->setActive($user, true, $request->user())),
        ]);
    }

    /** POST /users/{user}/temporary-password — AD7 asignar contraseña temporal */
    public function temporaryPassword(Request $request, User $user): JsonResponse
    {
        $result = $this->users->resetPassword($user, $request->user());

        return response()->json([
            'message' => "Contraseña temporal asignada a {$user->username}. Se cerraron sus sesiones.",
            'data' => new AdminUserResource($result['user']),
            'temporary_password' => $result['temporary_password'],
            'email_sent' => $result['email_sent'],
        ]);
    }

    /** GET /roles — AD7.3 matriz de permisos por rol */
    public function roles(): JsonResponse
    {
        return response()->json([
            'data' => $this->users->roles()->map(fn ($role) => [
                'id' => $role->id,
                'slug' => $role->slug,
                'name' => $role->name,
                'description' => $role->description,
                'active_users' => $role->users_count,
                'permissions' => $role->permissions->map(fn ($p) => [
                    'code' => $p->code,
                    'name' => $p->name,
                    'module' => $p->module,
                    'limit_pct' => $p->pivot->limit_pct !== null ? (float) $p->pivot->limit_pct : null,
                    'scope' => $p->pivot->scope,
                ])->values(),
            ]),
        ]);
    }
}
