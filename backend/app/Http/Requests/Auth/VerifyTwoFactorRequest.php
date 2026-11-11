<?php

namespace App\Http\Requests\Auth;

use Illuminate\Foundation\Http\FormRequest;

/** Segundo paso del acceso: el código de 6 dígitos que llegó por correo. */
class VerifyTwoFactorRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        $rules = ['challenge_id' => ['required', 'string', 'size:64']];

        // Reenviar solo necesita el reto; verificar también necesita el código
        if ($this->routeIs('auth.2fa.verify')) {
            $rules['code'] = ['required', 'digits:6'];
        }

        return $rules;
    }

    /** @return array<string, string> */
    public function attributes(): array
    {
        return [
            'challenge_id' => 'identificador de verificación',
            'code' => 'código',
        ];
    }

    protected function prepareForValidation(): void
    {
        if ($this->has('code')) {
            // Acepta "123 456" o "123-456" escrito por el usuario
            $this->merge(['code' => preg_replace('/\D/', '', (string) $this->input('code'))]);
        }
    }
}
