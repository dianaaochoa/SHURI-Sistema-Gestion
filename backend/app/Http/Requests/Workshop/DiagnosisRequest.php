<?php

namespace App\Http\Requests\Workshop;

use Illuminate\Foundation\Http\FormRequest;

/** T3 Diagnóstico del técnico: con reparación (pasa a cotizar) o sin reparación. */
class DiagnosisRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // la ruta ya exige permission:orders.repair
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'outcome' => ['required', 'in:repairable,not_repairable'],
            'diagnosis' => ['required', 'string', 'max:2000'],
            'failure_cause' => ['nullable', 'string', 'max:120'],
            'labor_level_id' => ['required_if:outcome,repairable', 'nullable', 'integer'],
            'estimated_minutes' => ['nullable', 'integer', 'min:5', 'max:2880'],
            'no_repair_reason' => ['required_if:outcome,not_repairable', 'nullable', 'string', 'max:255'],
        ];
    }

    /** @return array<string, string> */
    public function attributes(): array
    {
        return [
            'outcome' => 'resultado',
            'diagnosis' => 'diagnóstico',
            'failure_cause' => 'causa de la falla',
            'labor_level_id' => 'nivel de mano de obra',
            'estimated_minutes' => 'tiempo estimado',
            'no_repair_reason' => 'motivo de sin reparación',
        ];
    }
}
