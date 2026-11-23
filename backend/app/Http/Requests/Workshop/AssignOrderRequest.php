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
            // J2.2: fecha prometida al cliente y nota interna para el técnico
            'promised_date' => ['nullable', 'date', 'after_or_equal:today'],
            'notes' => ['nullable', 'string', 'max:500'],
        ];
    }

    /** @return array<string, string> */
    public function attributes(): array
    {
        return [
            'technician_id' => 'técnico',
            'priority' => 'prioridad',
            'promised_date' => 'fecha prometida',
            'notes' => 'nota',
        ];
    }
}
