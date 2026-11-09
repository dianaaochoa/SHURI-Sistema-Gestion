<?php

namespace App\Http\Requests\Auth;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Both recovery steps share this request:
 * forgot (login) → answer (recovery_id + answer).
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
        if ($this->routeIs('*.password.answer')) {
            return [
                'recovery_id' => ['required', 'string', 'size:64'],
                'answer' => ['required', 'string', 'max:100'],
            ];
        }

        return ['login' => ['required', 'string', 'max:150']];
    }

    /** @return array<string, string> */
    public function attributes(): array
    {
        return [
            'login' => $this->routeIs('portal.*') ? 'correo' : 'usuario o correo',
            'recovery_id' => 'identificador de recuperación',
            'answer' => 'respuesta',
        ];
    }

    protected function prepareForValidation(): void
    {
        if ($this->has('login')) {
            $this->merge(['login' => mb_strtolower(trim((string) $this->input('login')))]);
        }
    }
}
