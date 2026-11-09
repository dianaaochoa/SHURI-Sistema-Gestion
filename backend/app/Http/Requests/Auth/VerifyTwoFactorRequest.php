<?php

namespace App\Http\Requests\Auth;

use Illuminate\Foundation\Http\FormRequest;

/** Second login step: the 6-digit code received by email. */
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

        // Resend only needs the challenge; verify also needs the code
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
            // Accept "123 456" or "123-456" typed by the user
            $this->merge(['code' => preg_replace('/\D/', '', (string) $this->input('code'))]);
        }
    }
}
