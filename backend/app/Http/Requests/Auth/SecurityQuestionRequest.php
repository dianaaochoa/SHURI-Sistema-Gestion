<?php

namespace App\Http\Requests\Auth;

use App\Support\SecurityQuestions;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/** Configurar la pregunta de seguridad para recuperar la contraseña. */
class SecurityQuestionRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'current_password' => ['required', 'string', 'max:255'],
            'question' => ['required', 'string', Rule::in(SecurityQuestions::keys())],
            'answer' => ['required', 'string', 'min:3', 'max:100'],
        ];
    }

    /** @return array<string, string> */
    public function attributes(): array
    {
        return [
            'current_password' => 'contraseña actual',
            'question' => 'pregunta de seguridad',
            'answer' => 'respuesta',
        ];
    }
}
