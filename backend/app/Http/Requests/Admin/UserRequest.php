<?php

namespace App\Http\Requests\Admin;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * AD7 Alta (POST) y edición (PUT) de un empleado. En la edición todos los
 * campos son opcionales; la contraseña nunca se captura aquí (se asigna una temporal).
 */
class UserRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // la ruta ya exige permission:users.manage
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        $userId = $this->route('user')?->id;
        $required = $this->isMethod('post') ? 'required' : 'sometimes';

        return [
            'name' => [$required, 'string', 'max:150'],
            'username' => [$required, 'string', 'min:3', 'max:40', 'regex:/^[a-z0-9._-]+$/', Rule::unique('users', 'username')->ignore($userId)],
            'email' => [$required, 'email', 'max:150', Rule::unique('users', 'email')->ignore($userId)],
            'role_id' => [$required, 'integer', 'exists:roles,id'],
            'phone' => ['nullable', 'digits:10'],
            'cash_register_id' => ['nullable', 'integer', 'exists:cash_registers,id'],
            'specialty' => ['nullable', 'string', 'max:100'],
            'shift' => ['nullable', 'in:morning,evening,full_day'],
            'start_time' => ['nullable', 'date_format:H:i'],
            'end_time' => ['nullable', 'date_format:H:i'],
            'max_discount_pct' => ['sometimes', 'numeric', 'min:0', 'max:100'],
            'authorization_code' => ['nullable', 'string', 'min:4', 'max:50'],
            'two_factor_enabled' => ['sometimes', 'boolean'],
        ];
    }

    /** @return array<string, string> */
    public function attributes(): array
    {
        return [
            'name' => 'nombre',
            'username' => 'usuario',
            'email' => 'correo',
            'role_id' => 'rol',
            'phone' => 'teléfono',
            'cash_register_id' => 'caja',
            'specialty' => 'especialidad',
            'shift' => 'turno',
            'start_time' => 'hora de entrada',
            'end_time' => 'hora de salida',
            'max_discount_pct' => 'descuento máximo',
            'authorization_code' => 'clave de autorización',
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return ['username.regex' => 'El usuario solo puede tener minúsculas, números, punto, guion y guion bajo.'];
    }

    protected function prepareForValidation(): void
    {
        $this->merge(array_filter([
            'username' => $this->has('username') ? mb_strtolower(trim((string) $this->input('username'))) : null,
            'email' => $this->has('email') ? mb_strtolower(trim((string) $this->input('email'))) : null,
            'phone' => $this->filled('phone') ? preg_replace('/\D/', '', (string) $this->input('phone')) : null,
        ], fn ($v) => $v !== null));
    }
}
