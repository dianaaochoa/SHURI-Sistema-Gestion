<?php

namespace App\Http\Requests\Workshop;

use Illuminate\Foundation\Http\FormRequest;

/** J2 Asignar (o reasignar) una orden a un técnico. */
class AssignOrderRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // la ruta ya exige permission:orders.assign
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'technician_id' => ['required', 'integer'],
            'priority' => ['nullable', 'in:low,normal,high,urgent'],
        ];
    }

    /** @return array<string, string> */
    public function attributes(): array
    {
        return [
            'technician_id' => 'técnico',
            'priority' => 'prioridad',
        ];
    }
}
