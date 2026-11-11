<?php

namespace App\Http\Requests\Workshop;

use Illuminate\Foundation\Http\FormRequest;

/** C8 / C5 Cliente nuevo en mostrador. El correo es su usuario del portal (RF-06). */
class StoreCustomerRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // la ruta ya exige permission:customers.manage
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:100'],
            'last_name' => ['nullable', 'string', 'max:100'],
            'phone' => ['required', 'digits:10', 'unique:customers,phone'],
            'email' => ['required', 'email', 'max:150', 'unique:customers,email'],
            'address' => ['nullable', 'string', 'max:200'],
            'city' => ['nullable', 'string', 'max:100'],
            'postal_code' => ['nullable', 'digits:5'],
            'notes' => ['nullable', 'string', 'max:255'],
        ];
    }

    /** @return array<string, string> */
    public function attributes(): array
    {
        return [
            'name' => 'nombre',
            'last_name' => 'apellidos',
            'phone' => 'teléfono',
            'email' => 'correo',
            'address' => 'dirección',
            'city' => 'ciudad',
            'postal_code' => 'código postal',
            'notes' => 'notas',
        ];
    }

    protected function prepareForValidation(): void
    {
        $this->merge([
            'email' => mb_strtolower(trim((string) $this->input('email'))),
            'phone' => preg_replace('/\D/', '', (string) $this->input('phone')),
        ]);
    }
}
