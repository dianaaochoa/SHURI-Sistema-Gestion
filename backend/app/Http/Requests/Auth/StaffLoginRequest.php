<?php

namespace App\Http\Requests\Auth;

use Illuminate\Foundation\Http\FormRequest;

/** A.1 Staff login: username or email + password. */
class StaffLoginRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'login' => ['required', 'string', 'max:150'],
            'password' => ['required', 'string', 'max:255'],
            'device_name' => ['nullable', 'string', 'max:100'],
        ];
    }

    /** @return array<string, string> */
    public function attributes(): array
    {
        return [
            'login' => 'usuario o correo',
            'password' => 'contraseña',
            'device_name' => 'nombre del dispositivo',
        ];
    }

    protected function prepareForValidation(): void
    {
        $this->merge(['login' => mb_strtolower(trim((string) $this->input('login')))]);
    }
}
