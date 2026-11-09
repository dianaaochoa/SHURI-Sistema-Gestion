<?php

namespace App\Http\Requests\Auth;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rules\Password;

/**
 * The three recovery steps share this request; rules grow by step:
 * forgot (email) → verify-token (+ token) → reset (+ answer, new password).
 */
class PasswordRecoveryRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        $rules = ['email' => ['required', 'string', 'email', 'max:150']];

        if ($this->routeIs('*.password.verify-token', '*.password.reset')) {
            $rules['token'] = ['required', 'string', 'size:64'];
        }

        if ($this->routeIs('*.password.reset')) {
            $rules['answer'] = ['nullable', 'string', 'max:100'];
            $rules['password'] = ['required', 'string', 'max:255', 'confirmed', Password::defaults()];
        }

        return $rules;
    }

    /** @return array<string, string> */
    public function attributes(): array
    {
        return [
            'email' => 'correo',
            'token' => 'enlace',
            'answer' => 'respuesta',
            'password' => 'nueva contraseña',
        ];
    }

    protected function prepareForValidation(): void
    {
        $this->merge(['email' => mb_strtolower(trim((string) $this->input('email')))]);
    }
}
